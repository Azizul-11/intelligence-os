export interface SqlTemplateRegistryContext {
  domainId: string;

  version?: string;

  overwrite?: boolean;

  metadata?: Record<string, unknown>;
}