import fs from "node:fs";
import { parse } from "csv-parse/sync";

export function readDataset(datasetPath: string) {
  const csvContent = fs.readFileSync(datasetPath, "utf8");

  return parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });
}