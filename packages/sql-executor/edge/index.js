// src/mock-database-adapter.ts
var MockDatabaseAdapter = class {
  async execute(sql, parameters) {
    console.log("Executing SQL:");
    console.log(sql);
    console.log(parameters);
    return [];
  }
};

// src/supabase-database-adapter.ts
var SupabaseDatabaseAdapter = class {
  constructor(supabase) {
    this.supabase = supabase;
  }
  supabase;
  async execute(sql, _parameters) {
    console.log("========== SQL ==========");
    console.log(sql);
    console.log("=========================");
    const normalizedSql = sql.trim().replace(/;\s*$/, "");
    console.log("Calling run_sql RPC...");
    const { data, error } = await this.supabase.rpc("run_sql", {
      query: normalizedSql
    });
    console.log("RPC returned.");
    console.log("Data:", data);
    console.log("Error:", error);
    if (error) {
      console.error("run_sql failed:", error);
      throw error;
    }
    return data ?? [];
  }
};

// src/sql-executor.ts
var SqlExecutor = class {
  constructor(adapter) {
    this.adapter = adapter;
  }
  adapter;
  //     result = result.replaceAll(`:${key}`, replacement);
  //   }
  //   return result;
  // }
  /** Renders a scalar; anything that is not a string, finite number, boolean or bigint is refused, never interpolated. */
  renderScalar(value) {
    if (value === void 0 || value === null) {
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
  renderDirection(value) {
    if (value === void 0 || value === null) {
      return "DESC";
    }
    const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
    if (normalized !== "ASC" && normalized !== "DESC") {
      throw new Error(`Invalid direction parameter value: ${JSON.stringify(value)}`);
    }
    return normalized;
  }
  replaceParameters(template, parameters) {
    const declared = new Map((template.parameters ?? []).map((parameter) => [parameter.name, parameter]));
    if (declared.size === 0) {
      return template.template;
    }
    const names = [...declared.keys()].sort((a, b) => b.length - a.length).map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const placeholder = new RegExp(`(?<!:):(${names.join("|")})(?![A-Za-z0-9_])`, "g");
    return template.template.replace(placeholder, (_match, name) => {
      const parameter = declared.get(name);
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
  async execute(template, parameters) {
    console.log("========== SQL EXECUTOR ==========");
    console.log("Template ID:", template.id);
    console.log("Template Name:", template.name);
    console.log("Template Parameters:", template.parameters);
    console.log("Runtime Parameters:", parameters);
    for (const parameter of template.parameters ?? []) {
      if (parameter.required && (parameters[parameter.name] === void 0 || parameters[parameter.name] === null)) {
        return {
          success: false,
          rows: [],
          rowCount: 0,
          error: `Missing required parameter: ${parameter.name}`
        };
      }
    }
    try {
      const sql = this.replaceParameters(
        template,
        parameters
      );
      const rows = await this.adapter.execute(
        sql,
        parameters
      );
      return {
        success: true,
        rows,
        rowCount: rows.length
      };
    } catch (error) {
      return {
        success: false,
        rows: [],
        rowCount: 0,
        error: error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : "SQL execution failed."
      };
    }
  }
};
export {
  MockDatabaseAdapter,
  SqlExecutor,
  SupabaseDatabaseAdapter
};
