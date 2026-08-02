import type {
  Album,
  AlbumRef,
  ArtistBio,
  ArtistRef,
  MetadataProvider,
  NuclearPlugin,
  NuclearPluginAPI,
  PlaylistProvider,
  SearchParams,
  Track,
  TrackRef,
} from '@nuclearplayer/plugin-sdk';

import { isPlaylistUrl, MetadataClient } from './client';

const decode = (encoded: string): string => atob(encoded);
import {
  mapAlbumResponseToRef,
  mapAlbumUnionToAlbum,
  mapArtistResponseToRef,
  mapArtistToArtistBio,
  mapPlaylistToNuclearPlaylist,
  mapPodcastShowToChannel,
  mapPodcastShowToChannelRef,
  mapReleaseItemToAlbumRef,
  mapRelatedArtistToRef,
  mapTopTrackToTrackRef,
  mapTrackToNuclearTrack,
} from './mappers';
import type {
  PodcastChannel,
  PodcastChannelRef,
  PodcastEpisodeRef,
} from './podcast-sdk';

export const PROVIDER_ID = decode('c3BvdGlmeQ==');
const PLAYLIST_PROVIDER_ID = `${PROVIDER_ID}-playlists`;

let client: MetadataClient | null = null;

const createProvider = (): MetadataProvider => {
  const provider = {
    id: PROVIDER_ID,
    kind: 'metadata',
    name: decode('U3BvdGlmeQ=='),
    searchCapabilities: [
      'artists', 'albums', 'tracks',
      'podcastChannels', 'podcastHandles', 'podcastTitles',
    ] as MetadataProvider['searchCapabilities'],
    artistMetadataCapabilities: [
      'artistBio',
      'artistTopTracks',
      'artistAlbums',
      'artistRelatedArtists',
    ],
    albumMetadataCapabilities: ['albumDetails'],
    podcastChannelMetadataCapabilities: ['podcastChannelDetails'],
  searchArtists: async (
    params: Omit<SearchParams, 'types'>,
  ): Promise<ArtistRef[]> => {
    const data = await client!.searchArtists(params.query, params.limit ?? 15);
    return data.map(mapArtistResponseToRef);
  },
  searchAlbums: async (
    params: Omit<SearchParams, 'types'>,
  ): Promise<AlbumRef[]> => {
    const data = await client!.searchAlbums(params.query, params.limit ?? 15);
    return data.map(mapAlbumResponseToRef);
  },
  searchTracks: async (
    params: Omit<SearchParams, 'types'>,
  ): Promise<Track[]> => {
    const data = await client!.searchTracks(params.query, params.limit ?? 15);
    return data.map(mapTrackToNuclearTrack);
  },
  fetchArtistBio: async (artistUri: string): Promise<ArtistBio> => {
    const artist = await client!.getArtistOverview(artistUri);
    return mapArtistToArtistBio(artist);
  },
  fetchArtistTopTracks: async (artistUri: string): Promise<TrackRef[]> => {
    const topTracks = await client!.getArtistTopTracks(artistUri);
    return topTracks.map(mapTopTrackToTrackRef);
  },
  fetchArtistAlbums: async (artistUri: string): Promise<AlbumRef[]> => {
    const releases = await client!.getArtistAlbums(artistUri);
    return releases.map(mapReleaseItemToAlbumRef);
  },
  fetchArtistRelatedArtists: async (
    artistUri: string,
  ): Promise<ArtistRef[]> => {
    const artists = await client!.getRelatedArtists(artistUri);
    return artists.map(mapRelatedArtistToRef);
  },
  fetchAlbumDetails: async (albumUri: string): Promise<Album> => {
    const albumUnion = await client!.getAlbum(albumUri);
    return mapAlbumUnionToAlbum(albumUnion);
  },

  searchPodcastChannels: async (
    params: Omit<SearchParams, 'types'>,
  ): Promise<PodcastChannelRef[]> => {
    try {
      const shows = await client!.searchPodcastShows(
        params.query,
        params.limit ?? 15,
      );
      return shows.map(mapPodcastShowToChannelRef);
    } catch (err) {
      console.warn(`[spotify] searchPodcastChannels failed: ${err}`);
      return [];
    }
  },

  searchPodcastHandles: async (
    params: Omit<SearchParams, 'types'>,
  ): Promise<PodcastChannelRef[]> => {
    // Spotify shows have no @handles; the publisher name is reused as the
    // handle. Alias to channels search for now.
    return provider.searchPodcastChannels(params);
  },

  searchPodcastTitles: async (
    _params: Omit<SearchParams, 'types'>,
  ): Promise<PodcastEpisodeRef[]> => {
    // Search-by-episode-title requires an additional Pathfinder operation
    // (searchPodcastEpisodes). Hash not yet known — see TODO in client.ts.
    return [];
  },

  fetchPodcastChannelDetails: async (
    showUri: string,
  ): Promise<PodcastChannel> => {
    try {
      const [show, episodes] = await Promise.all([
        client!.getPodcastShow(showUri),
        client!.getPodcastShowEpisodes(showUri, 100),
      ]);
      return mapPodcastShowToChannel(show, episodes);
    } catch (err) {
      console.warn(`[spotify] fetchPodcastChannelDetails failed: ${err}`);
      return {
        title: showUri,
        source: { provider: PROVIDER_ID, id: showUri },
      };
    }
  },
  };
  return provider as MetadataProvider;
};

const createPlaylistProvider = (): PlaylistProvider => ({
  id: PLAYLIST_PROVIDER_ID,
  kind: 'playlists',
  name: decode('U3BvdGlmeQ=='),
  matchesUrl: isPlaylistUrl,
  fetchPlaylistByUrl: async (url: string) => {
    const playlist = await client!.getPlaylist(url);
    return mapPlaylistToNuclearPlaylist(playlist);
  },
}) satisfies PlaylistProvider;

const plugin: NuclearPlugin = {
  onEnable(api: NuclearPluginAPI) {
    client = new MetadataClient(api.Http.fetch);
    api.Providers.register(createProvider());
    api.Providers.register(createPlaylistProvider());
  },

  onDisable(api: NuclearPluginAPI) {
    api.Providers.unregister(PROVIDER_ID);
    api.Providers.unregister(PLAYLIST_PROVIDER_ID);
    client = null;
  },
};

export default plugin;
