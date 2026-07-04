import type { Timestamp } from "./timestamp";

/**
 * Shared metadata attached to platform objects.
 */
export interface Metadata {
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  createdBy?: string;
  updatedBy?: string;
  version?: number;
}