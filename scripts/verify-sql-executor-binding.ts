// Parameter binding in SqlExecutor: the audit's injection cases, and byte-for-byte equality with the old binder on every real template.
import { healthcareDomain } from "@intelligence/healthcare-domain";
import { SqlExecutor } from "@intelligence/sql-executor";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail = "") => {
  if (ok) passed++; else failed++;
  console.info(`${ok ? "PASS" : "FAIL"}: ${name}${ok ? "" : `  -- ${detail}`}`);
};

const captured: string[] = [];
const executor = new SqlExecutor({ execute: async (sql: string) => { captured.push(sql); return []; } } as any);
const quiet = async <T>(fn: () => Promise<T>): Promise<T> => {
  const log = console.log;
  console.log = () => {};
  try { return await fn(); } finally { console.log = log; }
};

type Param = { name: string; type: string; required?: boolean };
const tpl = (template: string, parameters: Param[]) => ({ id: "t", name: "t", template, parameters }) as any;

/** The SQL the executor would send, or the refusal message. */
async function bind(template: any, parameters: Record<string, unknown>): Promise<{ sql?: string; error?: string }> {
  captured.length = 0;
  const result = await quiet(() => executor.execute(template, parameters));
  return result.success ? { sql: captured[0] } : { error: result.error };
}

// The binder before this change, kept only as the reference for the equality check below.
function legacyBind(template: any, parameters: Record<string, unknown>): string {
  const scalar = (value: unknown) => (value === undefined || value === null ? "NULL" : typeof value === "string" ? `'${value.replace(/'/g, "''")}'` : String(value));
  let sql: string = template.template;
  for (const parameter of template.parameters ?? []) {
    const value = parameters[parameter.name];
    const replacement = parameter.type === "direction"
      ? (value === undefined || value === null ? "DESC" : String(value).trim().toUpperCase())
      : Array.isArray(value) ? (value.length > 0 ? value.map(scalar).join(", ") : "NULL") : scalar(value);
    sql = sql.replaceAll(`:${parameter.name}`, replacement);
  }
  return sql;
}

async function main() {
  console.info("-- cases that were safe and must stay safe");
  let r = await bind(tpl("SELECT * FROM h WHERE name = :name", [{ name: "name", type: "string" }]), { name: "O'Brien'; select 1 --" });
  check("a quote and a stacked statement in a string stay one quoted literal", r.sql === "SELECT * FROM h WHERE name = 'O''Brien''; select 1 --'", r.sql ?? r.error);

  r = await bind(tpl("SELECT * FROM h WHERE s IN (:states)", [{ name: "states", type: "array" }]), { states: ["TX", "x'); select 3 --"] });
  check("a quote inside an array element stays quoted", r.sql === "SELECT * FROM h WHERE s IN ('TX', 'x''); select 3 --')", r.sql ?? r.error);

  r = await bind(tpl("SELECT * FROM h ORDER BY s :direction", [{ name: "direction", type: "direction" }]), { direction: "asc; drop table h" });
  check("a direction outside ASC/DESC is refused", r.sql === undefined && /Invalid direction/.test(r.error ?? ""), r.sql ?? r.error);

  r = await bind(tpl("SELECT * FROM h ORDER BY s :direction", [{ name: "direction", type: "direction" }]), { direction: " asc " });
  check("a direction is normalised to ASC", r.sql === "SELECT * FROM h ORDER BY s ASC", r.sql ?? r.error);

  r = await bind(tpl("SELECT :a, :b, :c, :d", [{ name: "a", type: "string" }, { name: "b", type: "string" }, { name: "c", type: "string" }, { name: "d", type: "string" }]), { a: 12, b: true, c: null, d: undefined });
  check("number, boolean, null and undefined render as before", r.sql === "SELECT 12, true, NULL, NULL", r.sql ?? r.error);

  r = await bind(tpl("SELECT * FROM h WHERE s IN (:v)", [{ name: "v", type: "array" }]), { v: [] });
  check("an empty array renders as NULL", r.sql === "SELECT * FROM h WHERE s IN (NULL)", r.sql ?? r.error);

  console.info("-- cases that were unsafe and must now hold");
  const two = [{ name: "p1", type: "string" }, { name: "p2", type: "string" }];
  r = await bind(tpl("SELECT * FROM h WHERE a = :p1 AND b = :p2", two), { p1: "x :p2", p2: "1; select 2 --" });
  check("a value containing ':p2' is not re-scanned (p2 declared later)", r.sql === "SELECT * FROM h WHERE a = 'x :p2' AND b = '1; select 2 --'", r.sql ?? r.error);

  const swapped = await bind(tpl("SELECT * FROM h WHERE a = :p1 AND b = :p2", [...two].reverse()), { p1: "x :p2", p2: "1; select 2 --" });
  check("the result does not depend on declaration order", swapped.sql === r.sql, swapped.sql ?? swapped.error);

  const names = [{ name: "state", type: "string" }, { name: "states", type: "string" }];
  r = await bind(tpl("SELECT :state, :states", names), { state: "TX", states: "TX,FL" });
  check("':state' does not corrupt ':states' (state declared first)", r.sql === "SELECT 'TX', 'TX,FL'", r.sql ?? r.error);
  r = await bind(tpl("SELECT :state, :states", [...names].reverse()), { state: "TX", states: "TX,FL" });
  check("':state' does not corrupt ':states' (states declared first)", r.sql === "SELECT 'TX', 'TX,FL'", r.sql ?? r.error);

  r = await bind(tpl("SELECT :a", [{ name: "a", type: "string" }]), { a: "cost $& and $' and $1" });
  check("'$&' and \"$'\" in a value stay literal text", r.sql === "SELECT 'cost $& and $'' and $1'", r.sql ?? r.error);

  r = await bind(tpl("SELECT * FROM h WHERE n = :n", [{ name: "n", type: "string" }]), { n: { toString: () => "1 OR 1=1" } });
  check("an object value is refused, not interpolated", r.sql === undefined && /Unsupported parameter value type/.test(r.error ?? ""), r.sql ?? r.error);

  r = await bind(tpl("SELECT * FROM h WHERE s IN (:v)", [{ name: "v", type: "array" }]), { v: [["a", "b') OR ('1'='1"]] });
  check("a nested array element is refused", r.sql === undefined && /Unsupported parameter value type/.test(r.error ?? ""), r.sql ?? r.error);

  r = await bind(tpl("SELECT * FROM h WHERE n = :n", [{ name: "n", type: "string" }]), { n: Number.NaN });
  check("NaN is refused", r.sql === undefined && /Invalid numeric/.test(r.error ?? ""), r.sql ?? r.error);

  r = await bind(tpl("SELECT * FROM h WHERE n = :n", [{ name: "n", type: "string" }]), { n: Number.POSITIVE_INFINITY });
  check("Infinity is refused", r.sql === undefined && /Invalid numeric/.test(r.error ?? ""), r.sql ?? r.error);

  r = await bind(tpl("SELECT x::state FROM h WHERE s = :state", [{ name: "state", type: "string" }]), { state: "TX" });
  check("a '::state' cast is not a placeholder", r.sql === "SELECT x::state FROM h WHERE s = 'TX'", r.sql ?? r.error);

  r = await bind(tpl("SELECT :known, :unknown", [{ name: "known", type: "string" }]), { known: "a" });
  check("an undeclared token is left untouched", r.sql === "SELECT 'a', :unknown", r.sql ?? r.error);

  console.info("-- every real template: the new binder produces the old binder's SQL");
  const templates: any[] = Array.isArray((healthcareDomain as any).sqlTemplates) ? (healthcareDomain as any).sqlTemplates : Object.values((healthcareDomain as any).sqlTemplates ?? {});
  const sample = (parameter: Param, variant: number): unknown => {
    if (parameter.type === "direction") return variant === 1 ? "DESC" : "ASC";
    if (parameter.type === "array") return variant === 1 ? [] : ["A", "B'C"];
    if (parameter.type === "boolean") return variant === 1 ? false : true;
    return variant === 1 ? null : "O'Neil 'X'";
  };
  let compared = 0;
  const mismatches: string[] = [];
  for (const template of templates) {
    for (const variant of [0, 1, 2]) {
      const parameters: Record<string, unknown> = {};
      for (const parameter of template.parameters ?? []) {
        if (variant === 2 && !parameter.required) continue;
        parameters[parameter.name] = parameter.required && variant === 1 ? "REQ" : sample(parameter, variant);
      }
      const expected = legacyBind(template, parameters);
      const actual = await bind(template, parameters);
      compared++;
      if (actual.sql !== expected) mismatches.push(`${template.id} variant ${variant}`);
    }
  }
  check(`${templates.length} templates x 3 parameter sets (${compared} bindings) match the old binder`, mismatches.length === 0 && templates.length > 0, mismatches.slice(0, 3).join("; "));
  const withBoth = templates.filter((t) => (t.parameters ?? []).some((p: Param) => p.name === "state") && (t.parameters ?? []).some((p: Param) => p.name === "states")).length;
  check(`the ${withBoth} templates declaring both :state and :states are among them`, withBoth > 0);

  console.info(`\nRESULT: ${passed} passed, ${failed} failed (${passed + failed} total)`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
