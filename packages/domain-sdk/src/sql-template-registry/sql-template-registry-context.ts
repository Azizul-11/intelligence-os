/** Options for constructing an SqlTemplateRegistry. */
export interface SqlTemplateRegistryContext {
  domainId: string;

  version?: string;

  overwrite?: boolean;

  metadata?: Record<string, unknown>;
}