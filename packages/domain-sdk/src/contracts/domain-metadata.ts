/**
 * Human-readable information describing a Domain Pack.
 */
export interface DomainMetadata {
  id: string;
  name: string;
  displayName: string;
  description: string;

  author?: string;
  website?: string;
  license?: string;

  keywords?: string[];
}