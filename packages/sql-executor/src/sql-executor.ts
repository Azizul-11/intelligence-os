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

/**
 * Renders a single scalar value using the existing escaping/quoting
 * convention (unchanged from before Phase 7).
 */
private renderScalar(value: unknown): string {
  if (value === undefined || value === null) {
    return "NULL";
  }

  if (typeof value === "string") {
    return `'${value.replace(/'/g, "''")}'`;
  }

  return String(value);
}

/**
 * RCG-019: renders a sort-direction parameter as a bare, unquoted SQL
 * keyword (required for use directly after a column name in ORDER BY -
 * a quoted string literal there is not valid direction syntax). Only
 * ever ASC/DESC may be produced, from a strict, case-insensitive
 * whitelist - never raw interpolated text. Domain-agnostic: any Domain
 * SDK's SQL template may declare a parameter with type "direction" to
 * use this. Missing/absent defaults to DESC, preserving the ordering
 * every existing ranking template already hardcoded before this
 * parameter type existed.
 */
private renderDirection(value: unknown): string {
  if (value === undefined || value === null) {
    return "DESC";
  }

  const normalized =
    typeof value === "string" ? value.trim().toUpperCase() : "";

  if (normalized !== "ASC" && normalized !== "DESC") {
    throw new Error(`Invalid direction parameter value: ${JSON.stringify(value)}`);
  }

  return normalized;
}

private replaceParameters(
  template: SqlTemplateDefinition,
  parameters: Record<string, unknown>,
): string {
  let sql = template.template;

  for (const parameter of template.parameters ?? []) {
    const value = parameters[parameter.name];

    // Phase 7: array-valued parameters render as a comma-separated list
    // of individually escaped values (for templates that write
    // `IN (:paramName)`), reusing the same scalar escaping as every
    // other parameter. An empty array renders as a single NULL so
    // `IN (:paramName)` stays valid SQL and deterministically matches
    // nothing, rather than producing an empty, invalid `IN ()`.
    const replacement =
      parameter.type === "direction"
        ? this.renderDirection(value)
        : Array.isArray(value)
          ? value.length > 0
            ? value.map((element) => this.renderScalar(element)).join(", ")
            : "NULL"
          : this.renderScalar(value);

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


try {
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
} catch (error) {
  return {
    success: false,
    rows: [],
    rowCount: 0,
    error:
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String((error as { message: unknown }).message)
          : "SQL execution failed.",
  };
}
  }
}