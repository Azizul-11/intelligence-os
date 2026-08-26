#!/usr/bin/env tsx

/**
 * P1-2 Safety Performance Live Test
 * Tests "hospitals with better safety outcomes" query
 */

import { env } from "./shared/env";

const ORCHESTRATOR_URL = `${env.supabaseUrl}/functions/v1/orchestrator/chat`;
const ANON_KEY = env.supabaseAnonKey;

interface TestResult {
  query: string;
  success: boolean;
  rowCount: number;
  executionTimeMs: number;
  error?: string;
  sampleRows?: any[];
}

async function testQuery(query: string): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(ORCHESTRATOR_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ message: query }),
    });

    const executionTimeMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      return {
        query,
        success: false,
        rowCount: 0,
        executionTimeMs,
        error: `HTTP ${response.status}: ${errorText}`,
      };
    }

    const data = await response.json();

    return {
      query,
      success: data.success || false,
      rowCount: data.data?.length || 0,
      executionTimeMs,
      error: data.error,
      sampleRows: data.data?.slice(0, 3),
    };
  } catch (err) {
    return {
      query,
      success: false,
      rowCount: 0,
      executionTimeMs: Date.now() - startTime,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log("=".repeat(80));
  console.log("P1-2 SAFETY PERFORMANCE LIVE TEST");
  console.log("=".repeat(80));
  console.log("");

  const queries = [
    "hospitals with better safety outcomes",
    "safety performance ranking",
    "best hospitals for safety",
  ];

  for (const query of queries) {
    console.log(`Testing: "${query}"`);
    const result = await testQuery(query);

    if (result.success && result.rowCount > 0) {
      console.log(`✅ PASS - ${result.rowCount} rows in ${result.executionTimeMs}ms`);
      
      if (result.sampleRows && result.sampleRows.length > 0) {
        console.log("\nTop 3 hospitals:");
        result.sampleRows.forEach((row, idx) => {
          console.log(`  ${idx + 1}. ${row.hospital_name || row.facility_name}`);
          console.log(`     Safety Score: ${row.safety_score || "N/A"}`);
          console.log(`     Better Measures: ${row.safety_measures_better || 0}`);
          console.log(`     Worse Measures: ${row.safety_measures_worse || 0}`);
        });
      }
    } else {
      console.log(`❌ FAIL - ${result.error || "No data returned"}`);
    }

    console.log("");
  }

  console.log("=".repeat(80));
}

main().catch(console.error);
