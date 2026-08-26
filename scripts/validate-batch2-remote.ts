/**
 * MVP Batch #2 Phase 1 - Remote Warehouse Data Validation
 * 
 * Validates warehouse data against the REMOTE Supabase project
 * Uses the same connection as the live orchestrator
 */

import { createClient } from "@supabase/supabase-js";

import { env } from "./shared/env";

// Remote Supabase configuration (same as orchestrator), read from environment
const SUPABASE_URL = env.supabaseUrl;
const SUPABASE_SERVICE_ROLE_KEY = env.supabaseServiceRoleKey;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface ValidationResult {
  id: string;
  description: string;
  query: string;
  result?: any;
  error?: string;
}

const validations: ValidationResult[] = [
  {
    id: "V1",
    description: "Ownership values and distribution (BLOCKER for P1-1)",
    query: `
SELECT ownership, COUNT(*) as count
FROM warehouse_hospitals
WHERE ownership IS NOT NULL
GROUP BY ownership
ORDER BY ownership;
    `.trim(),
  },
  {
    id: "V2",
    description: "Emergency services data type and distribution (BLOCKER for P1-3)",
    query: `
SELECT emergency_services, COUNT(*) as count
FROM warehouse_hospitals
GROUP BY emergency_services
ORDER BY emergency_services;
    `.trim(),
  },
  {
    id: "V3",
    description: "Overall rating values and type (Phase 2)",
    query: `
SELECT overall_rating, COUNT(*) as count
FROM warehouse_hospitals
WHERE overall_rating IS NOT NULL
GROUP BY overall_rating
ORDER BY overall_rating;
    `.trim(),
  },
  {
    id: "V4",
    description: "Safety measure data availability (BLOCKER for P1-2)",
    query: `
SELECT 
  COUNT(*) as total_hospitals,
  SUM(CASE WHEN facility_safety_measure_count > 0 THEN 1 ELSE 0 END) as with_safety_data,
  SUM(CASE WHEN safety_measures_better > 0 THEN 1 ELSE 0 END) as with_better_safety,
  MIN(safety_measures_better) as min_better,
  MAX(safety_measures_better) as max_better,
  AVG(safety_measures_better) as avg_better
FROM warehouse_hospitals
WHERE facility_safety_measure_count > 0;
    `.trim(),
  },
  {
    id: "V5",
    description: "Safety measures sample data (BLOCKER for P1-2)",
    query: `
SELECT 
  facility_id,
  hospital_name,
  state,
  safety_measures_better,
  safety_measures_no_different,
  safety_measures_worse,
  facility_safety_measure_count
FROM warehouse_hospitals
WHERE facility_safety_measure_count > 0
ORDER BY safety_measures_better DESC NULLS LAST
LIMIT 10;
    `.trim(),
  },
  {
    id: "V6",
    description: "HCAHPS patient survey star rating values (Phase 2)",
    query: `
SELECT patient_survey_star_rating, COUNT(DISTINCT facility_id) as hospital_count
FROM warehouse_hospital_hcahps
WHERE patient_survey_star_rating IS NOT NULL
GROUP BY patient_survey_star_rating
ORDER BY patient_survey_star_rating;
    `.trim(),
  },
];

async function runValidation(validation: ValidationResult): Promise<void> {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`VALIDATION ${validation.id}: ${validation.description}`);
  console.log(`${"=".repeat(80)}`);
  console.log(`\nQuery:`);
  console.log(validation.query);

  try {
    // Normalize query: remove trailing whitespace and semicolon
    // run_sql wraps query in subquery, so trailing semicolon causes syntax error
    const normalizedQuery = validation.query.trim().replace(/;+\s*$/, '');

    const { data, error } = await supabase.rpc("run_sql", {
      query: normalizedQuery,
    });

    if (error) {
      validation.error = error.message;
      console.error(`\n❌ Error: ${error.message}`);
      return;
    }

    validation.result = data;
    console.log(`\n✅ Result (${data?.length ?? 0} rows):`);
    console.log(JSON.stringify(data, null, 2));
  } catch (err) {
    validation.error = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ Exception: ${validation.error}`);
  }
}

async function main() {
  console.log("╔════════════════════════════════════════════════════════════════════════════╗");
  console.log("║         MVP BATCH #2 PHASE 1 - REMOTE WAREHOUSE VALIDATION                ║");
  console.log("╚════════════════════════════════════════════════════════════════════════════╝");
  console.log(`\nRemote Supabase URL: ${SUPABASE_URL}`);
  console.log(`Using run_sql RPC (same as orchestrator)`);
  console.log(`\nTotal Validations: ${validations.length}`);

  for (const validation of validations) {
    await runValidation(validation);
  }

  console.log("\n" + "=".repeat(80));
  console.log("VALIDATION SUMMARY");
  console.log("=".repeat(80));

  const successful = validations.filter((v) => !v.error).length;
  const failed = validations.filter((v) => v.error).length;

  console.log(`Total:      ${validations.length}`);
  console.log(`✅ Success: ${successful}`);
  console.log(`❌ Failed:  ${failed}`);

  if (failed > 0) {
    console.log("\n⚠️  VALIDATION FAILED - DO NOT PROCEED WITH IMPLEMENTATION");
    process.exit(1);
  } else {
    console.log("\n✅ ALL VALIDATIONS PASSED");
  }

  console.log("=".repeat(80));
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
