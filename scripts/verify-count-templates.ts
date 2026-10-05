#!/usr/bin/env tsx
/** Live check of county/city hospital-count templates and the normalizer COUNT request shape (RULE 3(g), prompt-wording.ts); "how many hospitals are in <county/city>" used to answer as a list.
 * Usage: pnpm exec tsx scripts/verify-count-templates.ts */
import { env } from "./shared/env";

const ORCHESTRATOR_URL = `${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/orchestrator`;

interface Case {
  id: string;
  query: string;
  expect: "count" | "list" | "ambiguous" | "honest-refusal" | "unchanged";
}

const CASES: Case[] = [
  // The exact bug report.
  { id: "COUNTY1", query: "how many hospitals are in harris county", expect: "count" },
  // Cook County exists in GA/IL/MN and Dallas exists as both a county (AL/AR/IA/TX) and a city (OR/TX) - both are
  // genuinely ambiguous, same class as Houston below, not a county/city-count bug.
  { id: "COUNTY2", query: "count hospitals in cook county", expect: "ambiguous" },
  { id: "CITY1", query: "how many hospitals are in chicago", expect: "count" },
  { id: "CITY2", query: "number of hospitals in dallas", expect: "ambiguous" },
  // Regression: bare-city ambiguity must still ask for clarification, not silently count the wrong one.
  { id: "AMBIG1", query: "how many hospitals are in houston", expect: "ambiguous" },
  // Regression sentinels: the state count and the plain list must still work exactly as before.
  { id: "STATE1", query: "how many hospitals are in texas", expect: "count" },
  { id: "LIST1", query: "show me hospitals in harris county", expect: "list" },
  { id: "LIST3", query: "show me hospitals in chicago", expect: "list" },
  // The root-cause bug this batch found: "many" (Many, LA) was a false city match inside "how MANY hospitals",
  // which used to silently answer with Louisiana's count. No all-states-breakdown template exists (out of scope
  // for this batch) - an honest refusal here is correct; a fabricated single-state answer would not be.
  { id: "EACHSTATE", query: "how many hospitals are in each state", expect: "honest-refusal" },
];

async function main() {
  let pass = 0;
  let fail = 0;

  for (const c of CASES) {
    const res = await fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: env.supabaseAnonKey, Authorization: `Bearer ${env.supabaseAnonKey}` },
      body: JSON.stringify({ question: c.query }),
    });
    const body = await res.json();
    let rows: any[] = [];
    try {
      rows = body.success ? JSON.parse(body.answer || "[]") : [];
    } catch {
      rows = [];
    }
    const isCount = rows.length > 0 && rows.every((r) => typeof r.hospital_count === "number") && rows.length <= 3;
    const isList = rows.length > 0 && rows[0] && "facility_id" in rows[0] && !("hospital_count" in rows[0]);
    const isAmbiguous = !body.success && body.answerability?.status === "ambiguous";

    let ok: boolean;
    if (c.expect === "count") ok = body.success && isCount;
    else if (c.expect === "list") ok = body.success && isList;
    else if (c.expect === "ambiguous") ok = isAmbiguous;
    else if (c.expect === "honest-refusal") ok = !body.success && !isAmbiguous && rows.length === 0;
    else ok = true;

    pass += ok ? 1 : 0;
    fail += ok ? 0 : 1;
    console.log(
      `[${ok ? "PASS" : "FAIL"}] ${c.id.padEnd(8)} success=${String(body.success).padEnd(5)} rows=${rows.length} shape=${isCount ? "count" : isList ? "list" : isAmbiguous ? "ambiguous" : "other"} | "${c.query}"`,
    );
    if (!ok || rows.length > 0) {
      console.log(`  -> ${JSON.stringify(rows.slice(0, 2))}`);
    }
    if (!body.success && !isAmbiguous) {
      console.log(`  error: ${body.error}`);
    }
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed (${CASES.length} total)`);
  process.exit(fail > 0 ? 1 : 0);
}
main();
