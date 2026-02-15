import type { FetchFunction } from '@nuclearplayer/plugin-sdk';

import type {
  AlbumResponseWrapper,
  AlbumUnion,
  Artist,
  ArtistResponseWrapper,
  ArtistTopTrack,
  NotFound,
  OperationName,
  PathfinderArtistOverviewResponse,
  PathfinderGetAlbumResponse,
  PathfinderPlaylistResponse,
  PathfinderSearchResponse,
  PlaylistV2,
  ReleaseItem,
  Track,
  TrackResponseWrapper,
} from './types';

import { BROWSER_HEADERS, SpotifyAuth } from './auth';

const PATHFINDER_URL = 'https://api-partner.spotify.com/pathfinder/v2/query';

const OPERATION_HASHES: Record<OperationName, string> = {
  searchArtists: '0e6f9020a66fe15b93b3bb5c7e6484d1d8cb3775963996eaede72bac4d97e909',
  searchAlbums: 'a71d2c993fc98e1c880093738a55a38b57e69cc4ce5a8c113e6c5920f9513ee2',
  searchTracks: 'bc1ca2fcd0ba1013a0fc88e6cc4f190af501851e3dafd3e1ef85840297694428',
  queryArtistOverview: '1ac33ddab5d39a3a9c27802774e6d78b9405cc188c6f75aed007df2a32737c72',
  queryArtistDiscographyAll: '5e07d323febb57b4a56a42abbf781490e58764aa45feb6e3dc0591564fc56599',
  getAlbum: '97dd13a1f28c80d66115a13697a7ffd94fe3bebdb94da42159456e1d82bfee76',
  fetchPlaylist: 'e578eda4f77aae54294a48eac85e2a42ddb203faf6ea12b3fddaec5aa32918a3',
  fetchPlaylistContents: 'c56c706a062f82052d87fdaeeb300a258d2d54153222ef360682a0ee625284d9',
};

type ArtistCacheEntry = {
  data: Artist;
  fetchedAt: number;
};

const isNotFound = (data: Track | NotFound): data is NotFound =>
  data.__typename === 'NotFound';

const searchVariables = (searchTerm: string, limit: number) => ({
  searchTerm,
  limit,
  offset: 0,
  numberOfTopResults: limit,
  includeAudiobooks: false,
  includeArtistHasConcertsField: false,
  includePreReleases: false,
});

export class SpotifyClient {
  private readonly auth: SpotifyAuth;
  private artistOverviewCache: Map<string, ArtistCacheEntry> = new Map();
  private static readonly ARTIST_CACHE_TTL_MS = 60_000;

  constructor(private readonly fetch: FetchFunction) {
    this.auth = new SpotifyAuth(fetch);
  }

  async searchArtists(query: string, limit: number): Promise<ArtistResponseWrapper[]> {
    const response = await this.pathfinderQuery<PathfinderSearchResponse>(
      'searchArtists',
      searchVariables(query, limit),
    );
    return response.data.searchV2.artists.items;
  }

  async searchAlbums(query: string, limit: number): Promise<AlbumResponseWrapper[]> {
    const response = await this.pathfinderQuery<PathfinderSearchResponse>(
      'searchAlbums',
      searchVariables(query, limit),
    );
    return response.data.searchV2.albumsV2.items;
  }

  async searchTracks(query: string, limit: number): Promise<Track[]> {
    const response = await this.pathfinderQuery<PathfinderSearchResponse>(
      'searchTracks',
      searchVariables(query, limit),
    );
    return response.data.searchV2.tracksV2.items
      .filter((wrapper) => !isNotFound(wrapper.item.data))
      .map((wrapper) => wrapper.item.data as Track);
  }

  async getArtistOverview(artistUri: string): Promise<Artist> {
    const cached = this.artistOverviewCache.get(artistUri);
    if (cached && Date.now() - cached.fetchedAt < SpotifyClient.ARTIST_CACHE_TTL_MS) {
      return cached.data;
    }

    const response = await this.pathfinderQuery<PathfinderArtistOverviewResponse>(
      'queryArtistOverview',
      { uri: artistUri, locale: '' },
    );
    const artist = response.data.artistUnion;
    this.artistOverviewCache.set(artistUri, { data: artist, fetchedAt: Date.now() });
    return artist;
  }

  async getArtistTopTracks(artistUri: string): Promise<ArtistTopTrack[]> {
    const artist = await this.getArtistOverview(artistUri);
    return artist.discography.topTracks.items;
  }

  async getArtistAlbums(artistUri: string): Promise<ReleaseItem[]> {
    const response = await this.pathfinderQuery<PathfinderArtistOverviewResponse>(
      'queryArtistDiscographyAll',
      { uri: artistUri, order: 'DATE_DESC', limit: 50, offset: 0 },
    );
    const discographyAll = response.data.artistUnion.discography.all;
    if (!discographyAll) {
      return [];
    }
    return discographyAll.items.map((entry) => entry.releases.items[0]);
  }

  async getRelatedArtists(artistUri: string): Promise<Artist[]> {
    const artist = await this.getArtistOverview(artistUri);
    return artist.relatedContent.relatedArtists.items;
  }

  async getAlbum(albumUri: string): Promise<AlbumUnion> {
    const response = await this.pathfinderQuery<PathfinderGetAlbumResponse>(
      'getAlbum',
      { uri: albumUri, locale: '', offset: 0, limit: 50 },
    );
    return response.data.albumUnion;
  }

  async getPlaylist(playlistUri: string, limit = 50, offset = 0): Promise<PlaylistV2> {
    const response = await this.pathfinderQuery<PathfinderPlaylistResponse>(
      'fetchPlaylist',
      { uri: playlistUri, offset, limit },
    );
    return response.data.playlistV2;
  }

  async getPlaylistContents(playlistUri: string, limit = 50, offset = 0): Promise<PlaylistV2> {
    const response = await this.pathfinderQuery<PathfinderPlaylistResponse>(
      'fetchPlaylistContents',
      { uri: playlistUri, offset, limit },
    );
    return response.data.playlistV2;
  }

  private async executePathfinderRequest(body: string, token: string): Promise<Response> {
    return this.fetch(PATHFINDER_URL, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body,
    });
  }

  private async pathfinderQuery<T>(
    operationName: OperationName,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const body = JSON.stringify({
      operationName,
      variables,
      extensions: {
        persistedQuery: {
          version: 1,
          sha256Hash: OPERATION_HASHES[operationName],
        },
      },
    });

    const token = await this.auth.getAccessToken();
    const response = await this.executePathfinderRequest(body, token);

    if (response.status === 401) {
      const refreshedToken = await this.auth.refreshAccessToken();
      const retryResponse = await this.executePathfinderRequest(body, refreshedToken);
      if (!retryResponse.ok) {
        throw new Error(`Pathfinder API error: ${retryResponse.status}`);
      }
      return (await retryResponse.json()) as T;
    }

    if (!response.ok) {
      throw new Error(`Pathfinder API error: ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
