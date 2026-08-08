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

//   private replaceParameters(
//   sql: string,
//   parameters: Record<string, unknown>,
// ): string {
//   let result = sql;

//   for (const [key, value] of Object.entries(parameters)) {
//     const replacement =
//       typeof value === "string"
//         ? `'${value.replace(/'/g, "''")}'`
//         : String(value);

//     result = result.replaceAll(`:${key}`, replacement);
//   }

//   return result;
// }

private replaceParameters(
  template: SqlTemplateDefinition,
  parameters: Record<string, unknown>,
): string {
  let sql = template.template;

  for (const parameter of template.parameters ?? []) {
    const value = parameters[parameter.name];

    let replacement: string;

    if (value === undefined || value === null) {
      replacement = "NULL";
    } else if (typeof value === "string") {
      replacement = `'${value.replace(/'/g, "''")}'`;
    } else {
      replacement = String(value);
    }

    sql = sql.replaceAll(
      `:${parameter.name}`,
      replacement,
    );
  }

  return sql;
}
  async execute(
    template: SqlTemplateDefinition,
    parameters: Record<string, unknown>,
  ): Promise<SqlExecutionResult> {

    console.log("========== SQL EXECUTOR ==========");
console.log("Template ID:", template.id);
console.log("Template Name:", template.name);
console.log("Template Parameters:", template.parameters);
console.log("Runtime Parameters:", parameters);

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
  template,
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