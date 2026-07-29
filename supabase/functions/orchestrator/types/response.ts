export interface ChatResponse {
  success: boolean;

  answer: string;

  metadata?: {
    executionTimeMs?: number;
    rowCount?: number;
  };

  error?: string;
}