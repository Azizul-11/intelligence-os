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
import { parse } from "csv-parse/sync";
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
console.log(
  `Modified: ${datasetRegistration.modified.toISOString()}`,
);

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

// -----------------------------------------------------
// Print the dataset profile
// -----------------------------------------------------


printDatasetProfile(datasetProfile);

// -----------------------------------------------------
// Print the discovered schema
// -----------------------------------------------------

printSchema(datasetProfile.headers);


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

printFlattening(warehouse);

const warehouseBuild = buildWarehouse(warehouse);

printWarehouseBuild(warehouseBuild);

const verification = verifyWarehouse(warehouseBuild);

printVerification(verification);


if (!verification.passed) {
  process.exit(1);
}