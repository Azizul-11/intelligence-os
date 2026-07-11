export interface DatasetProfile {
  rowCount: number;
  columnCount: number;
  headers: string[];
}

export function discoverSchema(records: Record<string, unknown>[]): DatasetProfile {
  const headers = Object.keys(records[0] ?? {});

  return {
    rowCount: records.length,
    columnCount: headers.length,
    headers,
  };
}