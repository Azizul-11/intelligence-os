import type { ID, Metadata } from "@intelligence/contracts";

/** A possible entity discovered during ingestion; not yet resolved against the platform. */
export interface EntityCandidate {
  /** Candidate identifier. */
  id: ID;

  /** Display name. */
  name: string;

  /** Optional external identifier. */
  externalId?: string;

  /** Additional metadata. */
  metadata?: Metadata;
}