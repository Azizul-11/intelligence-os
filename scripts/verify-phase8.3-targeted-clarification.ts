/**
 * Phase 8.3 - Ambiguity Detection & Targeted Clarification Verification
 *
 * Verifies that the existing Phase 8.1 identity-ambiguity gate now
 * produces a TARGETED clarification (naming the ambiguous mention and
 * its real candidate labels) instead of a fixed generic sentence, using
 * real Healthcare data throughout - no invented/fabricated test data.
 *
 * Also verifies, at the wiring level (spy SqlExecutor, same methodology
 * as Phase 8.2's WIRING tests), that SQL still never executes for an
 * ambiguous request and still executes normally for an unambiguous one.
 *
 * NO SQL execution against a real database - the wiring tests use a spy
 * executor; all other checks are semantic/planning-only.
 */

import { healthcareDomain } from "../domain-packs/healthcare/src/index";
import { createDomainRuntime } from "../packages/domain-runtime/src/index";
import { createSemanticResolver } from "../packages/semantic/src/index";
import { createRuntimeEngine } from "../packages/runtime-engine/src/create-runtime-engine";
import { buildClarificationMessage } from "../packages/runtime-engine/src/build-clarification-message";
import { QueryPlanner } from "../packages/query-planner/src/query-planner";
import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";

interface Result {
  id: string;
  description: string;
  pass: boolean;
  detail: string;
}

const results: Result[] = [];

function check(id: string, description: string, pass: boolean, detail: string) {
  results.push({ id, description, pass, detail });
}

const runtime = createDomainRuntime(healthcareDomain);
const semantic = createSemanticResolver(runtime.registry, runtime.entityProvider);

// 1/2 - Targeted candidate labels + clarification message, for a real
// confirmed duplicate name (AL/Winfield + AZ/Tucson).
{
  const result = semantic.resolve("Northwest Medical Center overall rating");
  const ambiguities = result.identityAmbiguities ?? [];

  const candidates = ambiguities[0]?.candidates ?? [];
  const labels = candidates.map((c) =>
    typeof c === "object" && c !== null && "label" in c
      ? (c as { label?: unknown }).label
      : undefined,
  );

  const hasRealLabels =
    ambiguities.length === 1 &&
    labels.length === 2 &&
    labels.every((l) => typeof l === "string" && l.length > 0);

  check(
    "1-LABELS",
    "Ambiguous candidates carry real, human-readable labels (not bare IDs)",
    hasRealLabels,
    JSON.stringify(ambiguities),
  );

  const message = buildClarificationMessage(ambiguities);

  const isTargeted =
    message.includes("northwest medical center") &&
    labels.every((l) => typeof l === "string" && message.includes(l)) &&
    !message.toLowerCase().includes("can you clarify");

  check(
    "2-MESSAGE",
    "Clarification message names the mention and both real candidate labels, not a generic sentence",
    isTargeted,
    message,
  );
}

// 3 - Explicit qualifier still resolves uniquely, no clarification needed.
{
  const result = semantic.resolve("Northwest Medical Center in Arizona overall rating");
  const pass = !result.identityAmbiguities;
  check(
    "3-QUALIFIED",
    'Regression: "Northwest Medical Center in Arizona" still resolves uniquely (no clarification)',
    pass,
    JSON.stringify(result.identityAmbiguities),
  );
}

// 4 - Multiple legitimate explicit entities (real, already-proven Phase
// 7.5.5 pair) are never mistaken for ambiguity.
{
  const result = semantic.resolve("Compare Mayo Clinic and Cleveland Clinic overall rating");
  const pass = !result.identityAmbiguities;
  check(
    "4-MULTI-ENTITY",
    "Regression: multiple distinct, unambiguous entities are not flagged as ambiguous",
    pass,
    JSON.stringify(result.identityAmbiguities),
  );
}

// 5 - Mixed ambiguous + unambiguous request: the whole request remains
// blocked (approved Section 4.A scope decision - not reopened here),
// and the clarification still targets only the actually-ambiguous
// mention.
{
  const result = semantic.resolve("Compare Northwest Medical Center and Mayo Clinic overall rating");
  const ambiguities = result.identityAmbiguities ?? [];
  const pass = ambiguities.length === 1 && ambiguities[0]!.phrase === "northwest medical center";
  check(
    "5-MIXED",
    "Mixed ambiguous/unambiguous request: whole request still blocked, targeting only the ambiguous mention",
    pass,
    JSON.stringify(ambiguities),
  );
}

// 6 - Fallback: a Domain SDK returning bare, unlabeled candidate values
// must not crash, and must still produce a safe message.
{
  const message = buildClarificationMessage([
    {
      found: false,
      entityId: "widget",
      value: null,
      phrase: "some widget",
      status: "ambiguous",
      candidates: ["candidate-a", "candidate-b"],
    },
  ]);

  const pass =
    typeof message === "string" &&
    message.includes("some widget") &&
    message.includes("candidate-a") &&
    message.includes("candidate-b");

  check(
    "6-FALLBACK",
    "Unlabeled (bare-value) candidates degrade safely to raw-value display, no crash",
    pass,
    message,
  );
}

async function runWiringTests() {
  const planner = new QueryPlanner();
  const mapper = new ExecutionPlanMapper();

  // 7 - SQL prevention: a real ambiguous request never reaches the
  // executor.
  {
    let sqlExecutorCalled = false;

    const spyExecutor = {
      async execute() {
        sqlExecutorCalled = true;
        return { success: true, rows: [], rowCount: 0 };
      },
    };

    const engine = createRuntimeEngine({
      runtime,
      semantic,
      planner,
      executionPlanMapper: mapper,
      executor: spyExecutor as any,
    });

    const result = await engine.execute({
      question: "Northwest Medical Center overall rating",
      parameters: {},
    });

    const pass =
      result.success === false &&
      result.answerability?.status === "ambiguous" &&
      result.answerability?.reason === "identity-ambiguous" &&
      !sqlExecutorCalled &&
      typeof result.error === "string" &&
      !result.error.toLowerCase().includes("can you clarify");

    check(
      "7-SQL-PREVENTION",
      "RuntimeEngine refuses a real ambiguous request with a targeted message and never calls SqlExecutor",
      pass,
      JSON.stringify({ result, sqlExecutorCalled }),
    );
  }

  // 8 - A real, unambiguous, qualified request still reaches the
  // executor normally.
  {
    let sqlExecutorCalled = false;

    const spyExecutor = {
      async execute() {
        sqlExecutorCalled = true;
        return { success: true, rows: [{ ok: true }], rowCount: 1 };
      },
    };

    const engine = createRuntimeEngine({
      runtime,
      semantic,
      planner,
      executionPlanMapper: mapper,
      executor: spyExecutor as any,
    });

    const result = await engine.execute({
      question: "Northwest Medical Center in Arizona overall rating",
      parameters: {},
    });

    const pass = result.success === true && sqlExecutorCalled;

    check(
      "8-VALID-EXECUTES",
      "RuntimeEngine still executes a real, qualified, unambiguous request",
      pass,
      JSON.stringify({ result, sqlExecutorCalled }),
    );
  }

  console.log("=".repeat(80));
  console.log("PHASE 8.3 - TARGETED CLARIFICATION VERIFICATION");
  console.log("=".repeat(80));

  let allPass = true;

  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    if (!r.pass) allPass = false;
    console.log(`[${status}] ${r.id} - ${r.description}`);
    console.log(`       ${r.detail}`);
  }

  console.log("=".repeat(80));
  console.log(
    allPass
      ? `ALL ${results.length} CHECKS PASSED`
      : `FAILURES PRESENT (${results.filter((r) => !r.pass).length}/${results.length})`,
  );

  if (!allPass) {
    process.exit(1);
  }
}

runWiringTests().catch((error) => {
  console.error(error);
  process.exit(1);
});
