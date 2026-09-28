#!/usr/bin/env tsx
import { env } from "./shared/env";

const ORCHESTRATOR_URL = `${env.supabaseUrl.replace(/\/$/, "")}/functions/v1/orchestrator`;

// The genuine-regression rows from the grand sweep's layer0-swallowed-request bucket, each run 3x to separate a
// real prompt issue from one-off free-tier model variance. Excludes the pure scorer-artifact rows (F012-F015,
// expected conversational) and the security/gibberish probes (safe either way).
const QUERIES = [
  "trouble breathing",
  "hart problem",
  "okay so my dad had a heart attack last year and we live in Ohio",
  "show me something good",
  "hospitals please",
  "quality of care",
  "overall survey rating",
  "Community Memorial Hospital",
  "doctor", // Turn-2 bare-reply style, standalone
  "nurse",
  "medicine",
];

async function ask(question: string) {
  const res = await fetch(ORCHESTRATOR_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: env.supabaseAnonKey, Authorization: `Bearer ${env.supabaseAnonKey}` },
    body: JSON.stringify({ question }),
  });
  const body = await res.json();
  return body.answerability?.status === "conversational";
}

async function main() {
  let totalSwallowed = 0;
  let totalRuns = 0;
  for (const q of QUERIES) {
    const results: boolean[] = [];
    for (let i = 0; i < 3; i++) {
      results.push(await ask(q));
    }
    const swallowed = results.filter(Boolean).length;
    totalSwallowed += swallowed;
    totalRuns += 3;
    console.log(`${swallowed === 0 ? "PASS" : swallowed === 3 ? "FAIL(always)" : "FLAKY"} ${String(swallowed) + "/3"} swallowed | "${q}"`);
  }
  console.log(`\nTOTAL: ${totalSwallowed}/${totalRuns} calls swallowed conversationally`);
}
main();
