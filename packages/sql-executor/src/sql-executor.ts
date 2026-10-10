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



//     result = result.replaceAll(`:${key}`, replacement);
//   }

//   return result;
// }

/** Renders a scalar; anything that is not a string, finite number, boolean or bigint is refused, never interpolated. */
private renderScalar(value: unknown): string {
  if (value === undefined || value === null) {
    return "NULL";
  }

  if (typeof value === "string") {
    return `'${value.replace(/'/g, "''")}'`;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid numeric parameter value: ${value}`);
    }
    return String(value);
  }

  if (typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }

  throw new Error(`Unsupported parameter value type: ${Array.isArray(value) ? "nested array" : typeof value}`);
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
  const declared = new Map((template.parameters ?? []).map((parameter) => [parameter.name, parameter]));

  if (declared.size === 0) {
    return template.template;
  }

  // One pass over the template, longest declared name first: a rendered value is never re-scanned (":p2" inside a
  // value stays text) and ":states" is never read as ":state" followed by "s". "::" casts are not placeholders.
  const names = [...declared.keys()]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const placeholder = new RegExp(`(?<!:):(${names.join("|")})(?![A-Za-z0-9_])`, "g");

  // Phase 7: an array renders as a comma-separated list of escaped scalars for `IN (:name)`; an empty array renders
  // as NULL so the list stays valid SQL and matches nothing. A replacer function keeps "$&" in a value literal.
  return template.template.replace(placeholder, (_match, name: string) => {
    const parameter = declared.get(name)!;
    const value = parameters[name];

    if (parameter.type === "direction") {
      return this.renderDirection(value);
    }

    if (Array.isArray(value)) {
      return value.length > 0 ? value.map((element) => this.renderScalar(element)).join(", ") : "NULL";
    }

    return this.renderScalar(value);
  });
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