/** Live check of a comparison pinned by facility id against the deployed orchestrator: the gateway contract, the entity guard and the unchanged paths. */
import fs from "node:fs";

import { env } from "./shared/env";

const WEB_ENV = "apps/web/.env.local";
const QUESTION = "Compare the selected hospitals";
const MAYO = "240010";
const CLEVELAND = "360180";
const DUKE = "340030";
const WIREGRASS_A = "010062";
const WIREGRASS_B = "011309";

function readAnonKey(): string {
  const text = fs.readFileSync(WEB_ENV, "utf8");

  for (const line of text.split("\n")) {
    const [name, ...rest] = line.split("=");

    if (name?.trim() === "VITE_SUPABASE_ANON_KEY") {
      const value = rest.join("=").trim();

      return value.startsWith('"') || value.startsWith("'") ? value.slice(1, -1) : value;
    }
  }

  throw new Error(`VITE_SUPABASE_ANON_KEY missing from ${WEB_ENV}`);
}

const endpoint = `${env.supabaseUrl}/functions/v1/orchestrator`;
const anonKey = readAnonKey();

let pass = 0;
let fail = 0;

function check(id: string, label: string, condition: boolean, detail: string) {
  if (condition) {
    pass++;
    console.log(`  [PASS] ${id} ${label}`);
  } else {
    fail++;
    console.log(`  [FAIL] ${id} ${label} -- ${detail}`);
  }
}

type Reply = { status: number; body: Record<string, any>; rows: Record<string, unknown>[] | null; template: string | undefined };

async function post(body: unknown, headers: Record<string, string> = {}): Promise<Reply> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey, ...headers },
    body: JSON.stringify(body),
  });
  const parsed = (await response.json().catch(() => ({}))) as Record<string, any>;
  let rows: Record<string, unknown>[] | null = null;

  try {
    const value = JSON.parse(String(parsed.answer));
    rows = Array.isArray(value) ? value : null;
  } catch {
    rows = null;
  }

  const gate = ((parsed.trace ?? []) as { phase: string; detail?: { templateId?: string } }[]).find(
    (entry) => entry.phase === "deterministic-warehouse-execution" && entry.detail?.templateId,
  );

  return { status: response.status, body: parsed, rows, template: gate?.detail?.templateId };
}

const compare = (values: unknown, entityId: unknown = "hospital") => ({ question: QUESTION, domain: "healthcare", compare: { entityId, values } });

async function main() {
  console.log("A. pinned comparisons (names are never parsed)");
  let reply = await post(compare([MAYO, CLEVELAND, DUKE]));
  check("A1", "3 hospitals in 3 states -> 3 profile rows via the by-facility-ids template", reply.status === 200 && reply.body.success === true && reply.rows?.length === 3 && reply.template === "hospital-detail-by-facility-ids", `status=${reply.status} rows=${reply.rows?.length} template=${reply.template} error=${reply.body.error}`);
  check("A1b", "rows are exactly the three asked-for facilities", [MAYO, CLEVELAND, DUKE].every((id) => reply.rows?.some((row) => String(row.facility_id) === id)), "ids differ");
  check("A1c", "full dossier shape, so the compare view matches", Object.keys(reply.rows?.[0] ?? {}).length >= 50, `columns=${Object.keys(reply.rows?.[0] ?? {}).length}`);

  reply = await post(compare([WIREGRASS_A, WIREGRASS_B]));
  check("A2", "two same-name, same-city facilities -> 2 distinct rows", reply.body.success === true && new Set(reply.rows?.map((row) => String(row.facility_id))).size === 2, `rows=${reply.rows?.length} error=${reply.body.error}`);

  reply = await post(compare([MAYO, CLEVELAND]));
  check("A3", "two hospitals -> 2 rows", reply.body.success === true && reply.rows?.length === 2, `rows=${reply.rows?.length} error=${reply.body.error}`);

  console.log("B. the gateway refuses malformed selections (400, nothing executed)");
  const malformed: [string, string, unknown][] = [
    ["B1", "one value", compare([MAYO]).compare],
    ["B2", "four values", compare([MAYO, CLEVELAND, DUKE, WIREGRASS_A]).compare],
    ["B3", "duplicate values", compare([MAYO, MAYO]).compare],
    ["B4", "a non-string value", compare([MAYO, 360180]).compare],
    ["B5", "an over-long value", compare([MAYO, "9".repeat(65)]).compare],
    ["B6", "no entity id", { values: [MAYO, CLEVELAND] }],
    ["B7", "values that are not an array", compare("240010,360180").compare],
    ["B8", "compare that is not an object", [MAYO, CLEVELAND]],
  ];

  for (const [id, label, value] of malformed) {
    reply = await post({ question: QUESTION, domain: "healthcare", compare: value });
    check(id, `${label} -> 400`, reply.status === 400 && reply.body.success === false, `status=${reply.status}`);
  }

  console.log("C. what a well-formed request may and may not pin");
  reply = await post(compare(["TX", "OH"], "state"));
  check("C1", "an entity whose values do not identify one record (state) is refused", reply.body.success === false && String(reply.body.error).includes("can't be compared"), `success=${reply.body.success} error=${reply.body.error}`);

  reply = await post(compare(["a", "b"], "no-such-entity"));
  check("C2", "an unknown entity id is refused", reply.body.success === false && String(reply.body.error).includes("can't be compared"), `success=${reply.body.success} error=${reply.body.error}`);

  reply = await post(compare([MAYO, "999999"]));
  check("C3", "an id that matches no hospital is refused, never a one-row comparison", reply.body.success === false && String(reply.body.error).includes("couldn't find every selected"), `success=${reply.body.success} rows=${reply.rows?.length} error=${reply.body.error}`);

  reply = await post(compare(["x'); drop table warehouse_hospitals; --", MAYO]));
  check("C4", "an injection-shaped id is just an unmatched id", reply.body.success === false, `success=${reply.body.success} rows=${reply.rows?.length}`);

  reply = await post({ ...compare([MAYO, CLEVELAND]), pendingInteractionId: "not-a-uuid" });
  check("C5", "existing field validation still applies alongside compare", reply.status === 400, `status=${reply.status}`);

  console.log("D. nothing else changed");
  reply = await post({ question: "Compare Mayo Clinic and Cleveland Clinic", domain: "healthcare" });
  check("D1", "the named comparison still works", reply.body.success === true && reply.rows?.length === 2, `rows=${reply.rows?.length} error=${reply.body.error}`);

  reply = await post({ question: "Hospitals in New York City", domain: "healthcare" });
  check("D2", "an ordinary list question still works", reply.body.success === true && (reply.rows?.length ?? 0) > 5, `rows=${reply.rows?.length}`);

  reply = await post({ question: QUESTION, domain: "healthcare" });
  check("D3", "the neutral phrase without pinned ids is not answered as a comparison", reply.body.success === false || reply.rows?.length !== 2, `success=${reply.body.success} rows=${reply.rows?.length}`);

  reply = await post({ question: "Compare Mayo Clinic and Cleveland Clinic", domain: "healthcare" }, { Origin: "https://evil.example" });
  check("D4", "a foreign origin is still refused", reply.status === 403, `status=${reply.status}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
