export interface SemanticValidationResult {
  valid: boolean;

  warnings: string[];

  errors: string[];
}