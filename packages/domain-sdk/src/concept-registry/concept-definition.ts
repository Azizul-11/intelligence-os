/**
 * Describes a semantic concept exposed by a Domain Pack.
 */
export interface ConceptDefinition {
  id: string;

  name: string;

  displayName: string;

  description?: string;
}