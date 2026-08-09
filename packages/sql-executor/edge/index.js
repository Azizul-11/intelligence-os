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
  replaceParameters(template, parameters) {
    let sql = template.template;
    for (const parameter of template.parameters ?? []) {
      const value = parameters[parameter.name];
      let replacement;
      if (value === void 0 || value === null) {
        replacement = "NULL";
      } else if (typeof value === "string") {
        replacement = `'${value.replace(/'/g, "''")}'`;
      } else {
        replacement = String(value);
      }
      sql = sql.replaceAll(
        `:${parameter.name}`,
        replacement
      );
    }
    return sql;
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
  }
};
export {
  MockDatabaseAdapter,
  SqlExecutor,
  SupabaseDatabaseAdapter
};
