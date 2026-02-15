import type {
  Album,
  AlbumRef,
  ArtistBio,
  ArtistRef,
  MetadataProvider,
  NuclearPlugin,
  NuclearPluginAPI,
  SearchParams,
  Track,
  TrackRef,
} from '@nuclearplayer/plugin-sdk';

import { MetadataClient } from './client';

const decode = (encoded: string): string => atob(encoded);
import {
  mapAlbumResponseToRef,
  mapAlbumUnionToAlbum,
  mapArtistResponseToRef,
  mapArtistToArtistBio,
  mapReleaseItemToAlbumRef,
  mapRelatedArtistToRef,
  mapTopTrackToTrackRef,
  mapTrackToNuclearTrack,
} from './mappers';

export const PROVIDER_ID = decode('c3BvdGlmeQ==');

let client: MetadataClient | null = null;

const createProvider = (): MetadataProvider => ({
  id: PROVIDER_ID,
  kind: 'metadata',
  name: decode('U3BvdGlmeQ=='),
  searchCapabilities: ['artists', 'albums', 'tracks'],
  artistMetadataCapabilities: [
    'artistBio',
    'artistTopTracks',
    'artistAlbums',
    'artistRelatedArtists',
  ],
  albumMetadataCapabilities: ['albumDetails'],
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
}) satisfies MetadataProvider;

const plugin: NuclearPlugin = {
  onEnable(api: NuclearPluginAPI) {
    client = new MetadataClient(api.Http.fetch);
    api.Providers.register(createProvider());
  },

  onDisable(api: NuclearPluginAPI) {
    api.Providers.unregister(PROVIDER_ID);
    client = null;
  },
};

export default plugin;
