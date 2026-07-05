export interface RelationshipRegistryContext {
  domainId: string;

  version: string;

  configuration?: Record<string, unknown>;
}