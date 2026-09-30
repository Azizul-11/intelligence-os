/** One named, typed parameter an SQL template declares. */
export interface SqlTemplateParameter {
  name: string;

  type: string;

  required?: boolean;

  description?: string;

  defaultValue?: unknown;
}