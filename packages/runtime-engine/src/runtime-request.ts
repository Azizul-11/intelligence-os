export interface RuntimeRequest {
  question: string;
  parameters?: Record<string, unknown>;
}