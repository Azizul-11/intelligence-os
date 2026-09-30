/** Outcome of a batch SQL template registration. */
export interface SqlTemplateRegistryResult {
  registered: number;

  skipped: number;

  warnings: string[];

  errors: string[];
}