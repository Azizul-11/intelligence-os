/**
 * Phase 8.10 Layer 2: Bounded Conversational Continuation
 * 
 * Focused tests for two-turn clarification and guidance flows.
 * Tests pending interaction storage, retrieval, matching, and reconstruction.
 * 
 * PREREQUISITE: Migration 20260831_create_pending_interactions.sql must be applied
 */

import { createClient } from "@supabase/supabase-js";
import {
  createPendingInteraction,
  retrievePendingInteraction,
  consumePendingInteraction,
  matchClarificationResponse,
  matchGuidanceResponse,
} from "../packages/runtime-engine/dist/index.js";
import { env } from "./shared/env";

const ORCHESTRATOR_URL = `${env.supabaseUrl}/functions/v1/orchestrator`;

const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey);

interface TestResult {
  id: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(message);
}

function logTest(id: string, description: string) {
  console.log("\n" + "=".repeat(80));
  console.log(`${id}: ${description}`);
  console.log("=".repeat(80));
}

async function testClarificationMatching() {
  logTest("C-MATCH-1", "Clarification matching - exact city");

  try {
    const options = [
      {
        facility_id: "010140",
        hospital_name: "NORTHWEST MEDICAL CENTER",
        city: "WINFIELD",
        state: "AL",
        displayLabel: "NORTHWEST MEDICAL CENTER - WINFIELD, AL",
      },
      {
        facility_id: "030062",
        hospital_name: "NORTHWEST MEDICAL CENTER",
        city: "TUCSON",
        state: "AZ",
        displayLabel: "NORTHWEST MEDICAL CENTER - TUCSON, AZ",
      },
    ];

    const match1 = matchClarificationResponse("Tucson", options);
    if (!match1 || match1.facility_id !== "030062") {
      throw new Error("Failed to match 'Tucson' to AZ facility");
    }
    log("✅ Matched 'Tucson' correctly");

    const match2 = matchClarificationResponse("WINFIELD", options);
    if (!match2 || match2.facility_id !== "010140") {
      throw new Error("Failed to match 'WINFIELD' to AL facility");
    }
    log("✅ Matched 'WINFIELD' correctly");

    const match3 = matchClarificationResponse("Boston", options);
    if (match3 !== null) {
      throw new Error("Should not match invalid city");
    }
    log("✅ Correctly rejected invalid city");

    results.push({ id: "C-MATCH-1", passed: true });
  } catch (error) {
    log(`❌ FAIL: ${error instanceof Error ? error.message : String(error)}`);
    results.push({
      id: "C-MATCH-1",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function testGuidanceMatching() {
  logTest("G-MATCH-1", "Guidance matching - exact and partial");

  try {
    const options = [
      { capabilityId: "hospital-overall-rating", displayName: "Hospital Overall Rating" },
      { capabilityId: "mortality-rate", displayName: "Mortality Rate" },
      { capabilityId: "readmission-rate", displayName: "Readmission Rate" },
    ];

    const match1 = matchGuidanceResponse("use overall rating", options);
    if (!match1 || match1.capabilityId !== "hospital-overall-rating") {
      throw new Error("Failed to match 'use overall rating'");
    }
    log("✅ Matched 'use overall rating' correctly");

    const match2 = matchGuidanceResponse("mortality", options);
    if (!match2 || match2.capabilityId !== "mortality-rate") {
      throw new Error("Failed to match 'mortality'");
    }
    log("✅ Matched 'mortality' correctly");

    const match3 = matchGuidanceResponse("use infections", options);
    if (match3 !== null) {
      throw new Error("Should not match invalid capability");
    }
    log("✅ Correctly rejected invalid capability");

    results.push({ id: "G-MATCH-1", passed: true });
  } catch (error) {
    log(`❌ FAIL: ${error instanceof Error ? error.message : String(error)}`);
    results.push({
      id: "G-MATCH-1",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function testPendingInteractionLifecycle() {
  logTest("LIFECYCLE-1", "Pending interaction create/retrieve/consume");

  try {
    // Create pending clarification
    const interaction = await createPendingInteraction(supabase, {
      kind: "clarification",
      userId: "test-user-123",
      originalQuestion: "Northwest Medical Center",
      originalSemanticResult: { resolved: false },
      pendingTarget: {
        entityMention: "Northwest Medical Center",
        candidates: [
          { facility_id: "010140", hospital_name: "NORTHWEST MEDICAL CENTER", city: "WINFIELD", state: "AL" },
          { facility_id: "030062", hospital_name: "NORTHWEST MEDICAL CENTER", city: "TUCSON", state: "AZ" },
        ],
      },
      offeredOptions: [
        {
          facility_id: "010140",
          hospital_name: "NORTHWEST MEDICAL CENTER",
          city: "WINFIELD",
          state: "AL",
          displayLabel: "NORTHWEST MEDICAL CENTER - WINFIELD, AL",
        },
        {
          facility_id: "030062",
          hospital_name: "NORTHWEST MEDICAL CENTER",
          city: "TUCSON",
          state: "AZ",
          displayLabel: "NORTHWEST MEDICAL CENTER - TUCSON, AZ",
        },
      ],
    });

    log(`✅ Created pending interaction: ${interaction.id}`);

    // Retrieve it
    const retrieved = await retrievePendingInteraction(
      supabase,
      interaction.id,
      "test-user-123"
    );
    if (retrieved.id !== interaction.id) {
      throw new Error("Retrieved interaction ID mismatch");
    }
    log("✅ Retrieved pending interaction successfully");

    // Test cross-user isolation
    try {
      await retrievePendingInteraction(supabase, interaction.id, "other-user");
      throw new Error("Should have rejected cross-user access");
    } catch (error) {
      if (error instanceof Error && error.message.includes("Unauthorized")) {
        log("✅ Cross-user access correctly rejected");
      } else {
        throw error;
      }
    }

    // Consume it
    await consumePendingInteraction(supabase, interaction.id);
    log("✅ Consumed pending interaction");

    // Try to retrieve again (should fail - consumed)
    try {
      await retrievePendingInteraction(supabase, interaction.id, "test-user-123");
      throw new Error("Should have rejected consumed interaction");
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("already used") || error.message.includes("expired"))
      ) {
        log("✅ Consumed interaction correctly rejected on re-retrieval");
      } else {
        throw error;
      }
    }

    // Try to consume again (should fail or be no-op - replay protection)
    try {
      await consumePendingInteraction(supabase, interaction.id);
      // If it succeeds without error, that's also acceptable (idempotent behavior)
      log("✅ Replay protection working (idempotent or rejected)");
    } catch (error) {
      if (error instanceof Error && error.message.includes("already consumed")) {
        log("✅ Replay protection working (explicitly rejected)");
      } else {
        throw error;
      }
    }

    results.push({ id: "LIFECYCLE-1", passed: true });
  } catch (error) {
    log(`❌ FAIL: ${error instanceof Error ? error.message : String(error)}`);
    results.push({
      id: "LIFECYCLE-1",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function testExpiredInteraction() {
  logTest("EXPIRE-1", "Expired interaction rejection");

  try {
    // Create interaction with past expiry
    const { data, error } = await supabase
      .from("pending_interactions")
      .insert({
        kind: "clarification",
        user_id: "test-user",
        original_question: "test",
        original_semantic_result: {},
        pending_target: {},
        offered_options: [],
        expires_at: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        consumed: false,
      })
      .select()
      .single();

    if (error) throw error;

    // Try to retrieve expired interaction
    try {
      await retrievePendingInteraction(supabase, data.id, "test-user");
      throw new Error("Should have rejected expired interaction");
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("expired") || error.message.includes("not found"))
      ) {
        log("✅ Expired interaction correctly rejected");
      } else {
        throw error;
      }
    }

    results.push({ id: "EXPIRE-1", passed: true });
  } catch (error) {
    log(`❌ FAIL: ${error instanceof Error ? error.message : String(error)}`);
    results.push({
      id: "EXPIRE-1",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function testAnonymousFlow() {
  logTest("ANON-1", "Anonymous user flow (no user_id binding)");

  try {
    // Create interaction without user_id
    const interaction = await createPendingInteraction(supabase, {
      kind: "guidance",
      // NO userId specified
      originalQuestion: "hospitals ranked by length of stay",
      originalSemanticResult: {},
      pendingTarget: {
        unavailableCapabilityId: "length-of-stay",
        requestedOperation: "rank",
        scope: {},
      },
      offeredOptions: [
        { capabilityId: "hospital-overall-rating", displayName: "Hospital Overall Rating" },
        { capabilityId: "mortality-rate", displayName: "Mortality Rate" },
      ],
    });

    log(`✅ Created anonymous pending interaction: ${interaction.id}`);

    // Retrieve without user_id (should work)
    const retrieved = await retrievePendingInteraction(supabase, interaction.id);
    if (retrieved.id !== interaction.id) {
      throw new Error("Retrieved interaction ID mismatch");
    }
    log("✅ Retrieved anonymous interaction successfully");

    // Clean up
    await consumePendingInteraction(supabase, interaction.id);

    results.push({ id: "ANON-1", passed: true });
  } catch (error) {
    log(`❌ FAIL: ${error instanceof Error ? error.message : String(error)}`);
    results.push({
      id: "ANON-1",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function runAllTests() {
  console.log("\n");
  console.log("╔" + "═".repeat(78) + "╗");
  console.log("║" + " ".repeat(78) + "║");
  console.log("║" + "  PHASE 8.10 LAYER 2: BOUNDED CONVERSATIONAL CONTINUATION TESTS".padEnd(78) + "║");
  console.log("║" + " ".repeat(78) + "║");
  console.log("╚" + "═".repeat(78) + "╝");

  // Matching tests (no database required)
  await testClarificationMatching();
  await testGuidanceMatching();

  // Lifecycle tests (require database + migration)
  await testPendingInteractionLifecycle();
  await testExpiredInteraction();
  await testAnonymousFlow();

  // Summary
  console.log("\n" + "=".repeat(80));
  console.log("SUMMARY");
  console.log("=".repeat(80));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log("\nFailed Tests:");
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  ${r.id}: ${r.error}`);
      });
  }

  console.log("\n" + "=".repeat(80));

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch((error) => {
  console.error("\n❌ Test suite failed:", error);
  process.exit(1);
});
