export interface SqlTemplateParameter {
  name: string;

  type: string;

  required?: boolean;

  description?: string;

  defaultValue?: unknown;
}