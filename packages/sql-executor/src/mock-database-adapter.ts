import type { DatabaseAdapter } from "./database-adapter";

export class MockDatabaseAdapter implements DatabaseAdapter {
  async execute<T = unknown>(
    sql: string,
    parameters: Record<string, unknown>,
  ): Promise<T[]> {
    console.log("Executing SQL:");
    console.log(sql);
    console.log(parameters);

    return [];
  }
}