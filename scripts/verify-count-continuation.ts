#!/usr/bin/env tsx
/** Live check of Turn 1 (ambiguous) to Turn 2 (clarified) county/city hospital-count: "Cook County" clarified to Minnesota returned all 3 states because hospital-count-by-{county,city} declared no `state` parameter.
 * Usage: pnpm exec tsx scripts/verify-count-continuation.ts */
import { env } from "./shared/env";

const ORCHESTRATOR_URL = `${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/orchestrator`;

async function post(body: Record<string, unknown>) {
  const res = await fetch(ORCHESTRATOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.supabaseAnonKey, Authorization: `Bearer ${env.supabaseAnonKey}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

interface Case {
  id: string;
  turn1: string;
  turn2: string;
  expectRowState: string;
}

const CASES: Case[] = [
  { id: "COUNTY-MN", turn1: "How many hospitals are there in Cook County", turn2: "Minnesota", expectRowState: "MN" },
  { id: "COUNTY-GA", turn1: "How many hospitals are there in Cook County", turn2: "Georgia", expectRowState: "GA" },
  { id: "CITY-HOUSTON-TX", turn1: "how many hospitals are in houston", turn2: "Texas", expectRowState: "TX" },
];

async function main() {
  let pass = 0;
  let fail = 0;

  for (const c of CASES) {
    const turn1 = await post({ question: c.turn1 });
    if (!turn1.pendingInteractionId) {
      console.log(`[FAIL] ${c.id} turn1 did not ask for clarification: ${JSON.stringify(turn1).slice(0, 200)}`);
      fail++;
      continue;
    }

    const turn2 = await post({ pendingInteractionId: turn1.pendingInteractionId, continuationResponse: c.turn2 });
    let rows: any[] = [];
    try {
      rows = turn2.success ? JSON.parse(turn2.answer || "[]") : [];
    } catch {
      rows = [];
    }

    const states = [...new Set(rows.map((r) => r.state))];
    const ok = turn2.success && states.length === 1 && states[0] === c.expectRowState;
    pass += ok ? 1 : 0;
    fail += ok ? 0 : 1;
    console.log(`[${ok ? "PASS" : "FAIL"}] ${c.id} turn2 success=${turn2.success} states=${JSON.stringify(states)} rows=${JSON.stringify(rows)}`);
  }

  console.log(`\nRESULT: ${pass} passed, ${fail} failed (${CASES.length} total)`);
  process.exit(fail > 0 ? 1 : 0);
}
main();
