import type { ID, Metadata } from "@intelligence/contracts";

/**
 * Represents a possible entity discovered during ingestion.
 *
 * This is a candidate only.
 * It has not yet been resolved against the platform.
 */
export interface EntityCandidate {
  /**
   * Candidate identifier.
   */
  id: ID;

  /**
   * Display name.
   */
  name: string;

  /**
   * Optional external identifier.
   */
  externalId?: string;

  /**
   * Additional metadata.
   */
  metadata?: Metadata;
}