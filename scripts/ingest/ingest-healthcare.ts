/**
 * IntelligenceOS
 *
 * Phase 3.11 — First Real ETL
 *
 * First end-to-end ETL pipeline for the Healthcare Domain SDK.
 */

import { registerDataset } from "./pipeline/register";
import fs from "node:fs";
import path from "node:path";
import { resolveEntities } from "./pipeline/resolve";
import { flattenEntities } from "./pipeline/flatten";
import { buildWarehouse } from "./pipeline/warehouse";
import { verifyWarehouse } from "./pipeline/verify";
import { discoverSchema } from "./pipeline/schema";
import { validateDataset } from "./pipeline/validate";
import { normalizeRecords } from "./pipeline/normalize";
import { readDataset } from "./pipeline/read";
import {
  printDatasetProfile,
  printSchema,
  printValidation,
  printNormalization,
  printEntityResolution,
  printFlattening,
  printWarehouseBuild,
  printVerification,
} from "./pipeline/report";

import { insertHospitals } from "../warehouse/insert-hospitals";
import { insertStates } from "../warehouse/insert-states";
import { insertCounties } from "../warehouse/insert-counties";
import { insertDataset } from "../warehouse/insert-dataset";

import { insertPipelineRun } from "../warehouse/insert-pipeline-run";

async function main() {
  const startedAt = new Date();
  console.log("========================================");
  console.log("IntelligenceOS");
  console.log("Healthcare ETL");
  console.log("Phase 3.11 - First Real ETL");
  console.log("========================================");
  console.log("Starting Raw File Registration...");
  console.log("");

  // -----------------------------------------------------
  // Locate the raw dataset
  // -----------------------------------------------------

  const datasetPath = path.resolve(
    "data",
    "raw",
    "healthcare",
    "cms",
    "Hospital_General_Information.csv",
  );

  console.log(`Dataset Path: ${datasetPath}`);
  console.log("");

  // -----------------------------------------------------
  // Verify the dataset exists
  // -----------------------------------------------------

  if (!fs.existsSync(datasetPath)) {
    console.error("Dataset not found.");
    process.exit(1);
  }

  console.log("✓ Dataset found");
  console.log("");

  // -----------------------------------------------------
  // Register the raw file
  // -----------------------------------------------------

  const datasetRegistration = registerDataset(datasetPath);

  console.log("Raw File");
  console.log("----------------------------------------");
  console.log(`Name: ${path.basename(datasetPath)}`);
  console.log(`Size: ${datasetRegistration.size} bytes`);
  console.log(`Modified: ${datasetRegistration.modified.toISOString()}`);

  console.log("");

  console.log("Dataset Registration");
  console.log("----------------------------------------");
  console.log(`ID: ${datasetRegistration.id}`);
  console.log(`Name: ${datasetRegistration.name}`);
  console.log(`Domain: ${datasetRegistration.domain}`);
  console.log(`Source: ${datasetRegistration.source}`);
  console.log(`Provider: ${datasetRegistration.provider}`);
  console.log(`Version: ${datasetRegistration.version}`);
  console.log(`Format: ${datasetRegistration.format}`);

  /**
   * Phase 3.11.3 — Dataset Registration & Schema Discovery
   */

  // -----------------------------------------------------
  // Read the dataset
  // -----------------------------------------------------

  console.log("");

  console.log("Reading Dataset");
  console.log("----------------------------------------");

  const records = readDataset(datasetPath);

  console.log("✓ Dataset loaded");

  // -----------------------------------------------------
  // Discover the dataset schema
  // -----------------------------------------------------

  const datasetProfile = discoverSchema(records);

  printDatasetProfile(datasetProfile);
  printSchema(datasetProfile.headers);
  try {
    await insertDataset({
      dataset_id: datasetRegistration.id,
      dataset_name: datasetRegistration.name,
      domain: datasetRegistration.domain,
      provider: datasetRegistration.provider,
      source: datasetRegistration.source,
      version: datasetRegistration.version,
      format: datasetRegistration.format,
      row_count: datasetProfile.rowCount,
      column_count: datasetProfile.headers.length,
      checksum: datasetRegistration.checksum,
      last_ingested_at: new Date().toISOString(),
    });
    console.log("✓ Dataset Registry updated");
  } catch (error) {
    console.error("Failed to update dataset registry.");
    throw error;
  }


  /**
   * Phase 3.11.4 — Dataset Validation
   */

  // -----------------------------------------------------
  // Validate the dataset
  // -----------------------------------------------------

  const validation = validateDataset(datasetProfile);

  printValidation(datasetProfile, validation);

  /**
   * Phase 3.11.5 — Normalization
   */

  const normalizedRecords = normalizeRecords(records);

  printNormalization(normalizedRecords);

  const resolved = resolveEntities(normalizedRecords);

  printEntityResolution(resolved);

  const warehouse = flattenEntities(resolved);

  console.log("");
  console.log("Sample State");
  console.log("----------------------------------------");
  console.log(warehouse.states[0]);

  console.log("");
  console.log("Sample County");
  console.log("----------------------------------------");
  console.log(warehouse.counties[0]);

  printFlattening(warehouse);

  try {
    const inserted = await insertHospitals(warehouse.hospitals);

    console.log("");
    console.log(`✓ ${inserted} hospitals persisted to Supabase`);

    const insertedStates = await insertStates(warehouse.states);

    console.log(`✓ ${insertedStates} states persisted to Supabase`);

    const insertedCounties = await insertCounties(warehouse.counties);

    console.log(`✓ ${insertedCounties} counties persisted to Supabase`);
  } catch (error) {
    console.error("Failed to persist warehouse.");
    throw error;
  }

  const warehouseBuild = buildWarehouse(warehouse);
  printWarehouseBuild(warehouseBuild);

  const verification = verifyWarehouse(warehouseBuild);

  printVerification(verification);

try {
  const finishedAt = new Date();

  await insertPipelineRun({
    dataset_id: datasetRegistration.id,
    status: verification.passed ? "SUCCESS" : "FAILED",
    rows_processed: datasetProfile.rowCount,
    rows_inserted: warehouse.hospitals.length,
    rows_failed: 0,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms:
      finishedAt.getTime() - startedAt.getTime(),
  });

  console.log("✓ Pipeline Run recorded");
} catch (error) {
  console.error("Failed to record pipeline run.");
  throw error;
}

  if (!verification.passed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
