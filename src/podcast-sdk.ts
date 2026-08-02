// Temporary vendored shim of types from nukeop/nuclear#feat/add-podcast-support.
// Delete this file (and the single `as` cast in the metadata provider) once
// @nuclearplayer/plugin-sdk publishes a release that exports these types
// natively. Source files:
//   - packages/model/src/podcast.ts
//   - packages/plugin-sdk/src/types/{search,metadata}.ts
import type { ArtworkSet, ProviderRef, StreamCandidate } from '@nuclearplayer/plugin-sdk';

export type PodcastChannelRef = {
  title: string;
  handle?: string;
  artwork?: ArtworkSet;
  source: ProviderRef;
};

export type PodcastEpisodeRef = {
  title: string;
  channel?: PodcastChannelRef;
  description?: string;
  publishedAtIso?: string;
  durationMs?: number;
  artwork?: ArtworkSet;
  streamCandidates?: StreamCandidate[];
  source: ProviderRef;
};

export type PodcastChannel = {
  title: string;
  handle?: string;
  description?: string;
  artwork?: ArtworkSet;
  episodes?: PodcastEpisodeRef[];
  source: ProviderRef;
};

export type PodcastChannelMetadataCapability = 'podcastChannelDetails';
