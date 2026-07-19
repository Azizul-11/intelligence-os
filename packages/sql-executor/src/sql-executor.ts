import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";
import type { DatabaseAdapter } from "./database-adapter";
export interface SqlExecutionResult<T = unknown> {
  success: boolean;
  rows: T[];
  rowCount: number;
  error?: string;
}

export class SqlExecutor {
  constructor(
    private readonly adapter: DatabaseAdapter,
  ) {}

  private replaceParameters(
  sql: string,
  parameters: Record<string, unknown>,
): string {
  let result = sql;

  for (const [key, value] of Object.entries(parameters)) {
    const replacement =
      typeof value === "string"
        ? `'${value.replace(/'/g, "''")}'`
        : String(value);

    result = result.replaceAll(`:${key}`, replacement);
  }

  return result;
}
  async execute(
    template: SqlTemplateDefinition,
    parameters: Record<string, unknown>,
  ): Promise<SqlExecutionResult> {
    for (const parameter of template.parameters ?? []) {
      if (
        parameter.required &&
        (parameters[parameter.name] === undefined ||
          parameters[parameter.name] === null)
      ) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: `Missing required parameter: ${parameter.name}`,
        };
      }
    }

    
const sql = this.replaceParameters(
  template.template,
  parameters,
);

const rows = await this.adapter.execute(
  sql,
  parameters,
);

return {
  success: true,
  rows,
  rowCount: rows.length,
};
  }
}