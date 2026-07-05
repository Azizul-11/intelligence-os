export interface SqlTemplateRegistryResult {
  registered: number;

  skipped: number;

  warnings: string[];

  errors: string[];
}