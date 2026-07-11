export interface ValidationResult {
  passed: boolean;
  hasRows: boolean;
  hasColumns: boolean;
  requiredColumnsPassed: boolean;
  duplicateColumnsPassed: boolean;
  missingColumns: string[];
}

interface DatasetProfile {
  rowCount: number;
  columnCount: number;
  headers: string[];
}

export function validateDataset(
  dataset: DatasetProfile,
): ValidationResult {
  const hasRows = dataset.rowCount > 0;

  const hasColumns = dataset.columnCount > 0;

  const requiredColumns = [
    "Facility ID",
    "Facility Name",
    "State",
    "County/Parish",
  ];

  const missingColumns = requiredColumns.filter(
    (column) => !dataset.headers.includes(column),
  );

  const requiredColumnsPassed = missingColumns.length === 0;

  const duplicateColumns = dataset.headers.filter(
    (header, index, headers) => headers.indexOf(header) !== index,
  );

  const duplicateColumnsPassed = duplicateColumns.length === 0;

  return {
    passed:
      hasRows &&
      hasColumns &&
      requiredColumnsPassed &&
      duplicateColumnsPassed,

    hasRows,

    hasColumns,

    requiredColumnsPassed,

    duplicateColumnsPassed,

    missingColumns,
  };
}