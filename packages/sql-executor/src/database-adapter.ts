export interface DatabaseAdapter {
  execute<T = unknown>(
    sql: string,
    parameters: Record<string, unknown>,
  ): Promise<T[]>;
}