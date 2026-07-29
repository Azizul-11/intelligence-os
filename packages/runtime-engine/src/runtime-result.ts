export interface RuntimeResult<T = unknown> {
  success: boolean;

  rows: T[];

  rowCount: number;

  error?: string;
}