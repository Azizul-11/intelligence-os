import fs from "node:fs";
import path from "node:path";

import { registerDataset } from "./pipeline/register";
import { readDataset } from "./pipeline/read";
import { discoverSchema } from "./pipeline/schema";
import { validateDataset } from "./pipeline/validate";

import {
  printDatasetProfile,
  printSchema,
  printValidation,
  printNormalization,
} from "./pipeline/report";

import { hospitalHcahpsManifest } from "./datasets/healthcare/hcahps/manifest";
import { normalizeHospitalHcahpsRecords } from "./datasets/healthcare/hcahps/normalize";
import { flattenHospitalHcahps } from "./datasets/healthcare/hcahps/flatten";
import { verifyHospitalHcahps } from "./datasets/healthcare/hcahps/verify";

import { insertHospitalHcahps } from "../warehouse/insert-hospital-hcahps";

import { insertDataset } from "../warehouse/insert-dataset";
import { insertPipelineRun } from "../warehouse/insert-pipeline-run";
import { findDatasetByChecksum } from "../warehouse/find-dataset-by-checksum";


async function main() {
  const startedAt = new Date();
console.log("========================================");
console.log("IntelligenceOS");
console.log("Healthcare ETL");
console.log("Phase 4.5 - HCAHPS ETL");
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
  "HCAHPS-Hospital.csv",
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

  const datasetRegistration = registerDataset(
  datasetPath,
  hospitalHcahpsManifest,
);

const existingDataset =
  await findDatasetByChecksum(
    datasetRegistration.checksum,
  );

  if (existingDataset) {
  console.log("");
  console.log("✓ Dataset already ingested");
  console.log(`Checksum: ${datasetRegistration.checksum}`);
  console.log("Skipping ETL.");

  return;
}

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

const validation = validateDataset(
  datasetProfile,
  hospitalHcahpsManifest.requiredColumns,
);

  printValidation(datasetProfile, validation);

  /**
   * Phase 3.11.5 — Normalization
   */
const normalizedRecords =
  normalizeHospitalHcahpsRecords(records);

printNormalization(normalizedRecords);

const warehouse =
  flattenHospitalHcahps(normalizedRecords);

console.log("");
console.log("Sample HCAHPS Record");
console.log("----------------------------------------");
console.log(warehouse[0]);

try {
  const inserted =
    await insertHospitalHcahps(warehouse);

  console.log("");
  console.log(
  `✓ ${inserted} HCAHPS records persisted to Supabase`,
);
} catch (error) {
 console.error("Failed to persist HCAHPS records.");
  throw error;
}


const verification =
  verifyHospitalHcahps(warehouse);


  console.log("");
console.log("Verification");
console.log("----------------------------------------");

console.log(
  `Rows                  : ${
    verification.hasRows ? "✓ Passed" : "✗ Failed"
  }`,
);

console.log(
  `Facility IDs          : ${
    verification.missingFacilityIdsPassed
      ? "✓ Passed"
      : "✗ Failed"
  }`,
);

console.log(
  `Measure Codes         : ${
    verification.missingMeasureCodesPassed
      ? "✓ Passed"
      : "✗ Failed"
  }`,
);

console.log(
  `Duplicate Keys        : ${
    verification.duplicateKeysPassed
      ? "✓ Passed"
      : "✗ Failed"
  }`,
);

if (!verification.passed) {
  console.log("");
  console.log("Duplicate Keys:");
  console.log(verification.duplicateKeys);

 throw new Error(
  "Hospital HCAHPS verification failed.",
);
}

console.log("✓ Verification Passed");


try {
  const finishedAt = new Date();

  await insertPipelineRun({
    dataset_id: datasetRegistration.id,
    status: verification.passed ? "SUCCESS" : "FAILED",
    rows_processed: datasetProfile.rowCount,
    rows_inserted: warehouse.length,
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
