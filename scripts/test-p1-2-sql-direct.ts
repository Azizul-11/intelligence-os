#!/usr/bin/env -S pnpm exec tsx

/**
 * P1-2 Safety Performance SQL Direct Test
 * Tests the safety-performance-ranking SQL template directly against warehouse
 */

import { createClient } from "@supabase/supabase-js";

import { env } from "./shared/env";

const SUPABASE_URL = env.supabaseUrl;
const SERVICE_ROLE_KEY = env.supabaseServiceRoleKey;

const SQL_TEMPLATE = `
SELECT
    facility_id,
    hospital_name,
    city,
    state,
    county,
    hospital_type,
    safety_measures_better,
    safety_measures_no_different,
    safety_measures_worse,
    facility_safety_measure_count,
    CASE
        WHEN facility_safety_measure_count > 0 THEN
            ROUND(
                (safety_measures_better::numeric / facility_safety_measure_count::numeric) * 100,
                2
            )
        ELSE 0
    END as safety_score
FROM warehouse_hospitals
WHERE facility_safety_measure_count > 0
ORDER BY safety_score DESC, hospital_name ASC
LIMIT 100;
`.trim();

async function testSafetyPerformanceSQL() {
  console.log("=".repeat(80));
  console.log("P1-2 SAFETY PERFORMANCE SQL DIRECT TEST");
  console.log("=".repeat(80));
  console.log("");

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  console.log("Executing SQL template...");
  console.log("");

  try {
    const { data, error } = await supabase.rpc("run_sql", {
      query: SQL_TEMPLATE,
    });

    if (error) {
      console.log("❌ FAIL - SQL Error:");
      console.log(error);
      process.exit(1);
    }

    if (!data || data.length === 0) {
      console.log("❌ FAIL - No data returned");
      process.exit(1);
    }

    console.log(`✅ PASS - ${data.length} hospitals returned`);
    console.log("");
    console.log("Top 10 Hospitals by Safety Score:");
    console.log("=".repeat(80));

    data.slice(0, 10).forEach((row: any, idx: number) => {
      console.log(`${idx + 1}. ${row.hospital_name}`);
      console.log(`   Location: ${row.city}, ${row.state}`);
      console.log(`   Safety Score: ${row.safety_score}%`);
      console.log(`   Better Measures: ${row.safety_measures_better}/${row.facility_safety_measure_count}`);
      console.log(`   Worse Measures: ${row.safety_measures_worse}/${row.facility_safety_measure_count}`);
      console.log("");
    });

    // Validate data quality
    console.log("Data Quality Validation:");
    console.log("=".repeat(80));

    const allHaveScore = data.every((row: any) => row.safety_score !== null && row.safety_score !== undefined);
    const allHaveMeasures = data.every((row: any) => row.facility_safety_measure_count > 0);
    const sortedCorrectly = data.every((row: any, idx: number, arr: any[]) => {
      if (idx === 0) return true;
      return row.safety_score <= arr[idx - 1].safety_score;
    });

    console.log(`✅ All rows have safety_score: ${allHaveScore}`);
    console.log(`✅ All rows have measures > 0: ${allHaveMeasures}`);
    console.log(`✅ Results sorted by safety_score DESC: ${sortedCorrectly}`);
    console.log("");

    if (allHaveScore && allHaveMeasures && sortedCorrectly) {
      console.log("✅ P1-2 SQL TEMPLATE VALIDATED");
      console.log("");
      console.log("Template ready for deployment when orchestrator is redeployed.");
    } else {
      console.log("❌ VALIDATION FAILED - Data quality issues detected");
      process.exit(1);
    }

  } catch (err) {
    console.log("❌ FAIL - Exception:");
    console.log(err);
    process.exit(1);
  }

  console.log("=".repeat(80));
}

testSafetyPerformanceSQL().catch(console.error);
