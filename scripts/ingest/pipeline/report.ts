import {
  title,
  info,
  success,
  failure,
} from "./logger";

export function printDatasetProfile(profile: {
  rowCount: number;
  columnCount: number;
}) {
  title("Dataset Profile");

  info("Rows", profile.rowCount);
  info("Columns", profile.columnCount);
}

export function printSchema(headers: string[]) {
  title("Discovered Schema");

  for (const header of headers) {
    console.log(`• ${header}`);
  }
}

export function printValidation(
  datasetProfile: any,
  validation: any,
) {
  title("Dataset Validation");

  console.log(
    `Rows Present: ${
      validation.hasRows ? "✓ Passed" : "✗ Failed"
    } (${datasetProfile.rowCount})`,
  );

  console.log(
    `Columns Present: ${
      validation.hasColumns ? "✓ Passed" : "✗ Failed"
    } (${datasetProfile.columnCount})`,
  );

  console.log(
    `Required Columns: ${
      validation.requiredColumnsPassed
        ? "✓ Passed"
        : "✗ Failed"
    }`,
  );

  if (!validation.requiredColumnsPassed) {
    console.log("Missing:");

    for (const column of validation.missingColumns) {
      console.log(`  • ${column}`);
    }
  }

  console.log(
    `Duplicate Columns: ${
      validation.duplicateColumnsPassed
        ? "✓ Passed"
        : "✗ Failed"
    }`,
  );

  if (validation.passed) {
    success("Dataset Validation Passed");
  } else {
    failure("Dataset Validation Failed");
  }
}

export function printNormalization(records: any[]) {
  title("Normalization");

  info("Normalized Records", records.length);

  title("Sample Normalized Record");

  console.log(records[0]);
}

export function printEntityResolution(resolved: {
  hospitals: Map<any, any>;
  states: Map<any, any>;
  counties: Map<any, any>;
}) {
  title("Entity Resolution");

  info("Hospitals", resolved.hospitals.size);
  info("States", resolved.states.size);
  info("Counties", resolved.counties.size);
}

export function printFlattening(warehouse: {
  hospitals: any[];
  states: any[];
  counties: any[];
}) {
  title("Flattening");

  info("Hospital Rows", warehouse.hospitals.length);
  info("State Rows", warehouse.states.length);
  info("County Rows", warehouse.counties.length);

  title("Sample Warehouse Hospital");

  console.log(warehouse.hospitals[0]);
}

export function printWarehouseBuild(warehouseBuild: {
  hospitals: number;
  states: number;
  counties: number;
  totalRecords: number;
}) {
  title("Warehouse Build");

  info("Hospital Records", warehouseBuild.hospitals);
  info("State Records", warehouseBuild.states);
  info("County Records", warehouseBuild.counties);
  info("Total Records", warehouseBuild.totalRecords);

  success("Warehouse Build Complete");
}

export function printVerification(verification: {
  passed: boolean;
  checks: {
    hospitals: boolean;
    states: boolean;
    counties: boolean;
    warehouse: boolean;
  };
}) {
  title("Verification");

  console.log(
    `Hospitals : ${verification.checks.hospitals ? "✓ Passed" : "✗ Failed"}`
  );

  console.log(
    `States    : ${verification.checks.states ? "✓ Passed" : "✗ Failed"}`
  );

  console.log(
    `Counties  : ${verification.checks.counties ? "✓ Passed" : "✗ Failed"}`
  );

  console.log(
    `Warehouse : ${verification.checks.warehouse ? "✓ Passed" : "✗ Failed"}`
  );

  if (verification.passed) {
    success("Verification Passed");
  } else {
    failure("Verification Failed");
  }
}