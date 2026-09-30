/** Describes a semantic concept exposed by a Domain Pack. */
export interface ConceptDefinition {
  id: string;

  name: string;

  displayName: string;

  description?: string;

  /** Maps a resolved metric's canonical id to this concept's measure code for that metric - read generically to build a `measureCode` filter. */
  measureCodesByMetric?: Record<string, string>;
}