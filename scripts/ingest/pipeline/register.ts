import fs from "node:fs";
import crypto from "node:crypto";

export interface DatasetRegistration {
  id: string;
  name: string;
  domain: string;
  provider: string;
  source: string;
  format: string;
  version: string;
  path: string;
  size: number;
  modified: Date;
  checksum: string;
}
export function registerDataset(
  datasetPath: string,
  manifest: Omit<
  DatasetRegistration,
  "path" | "size" | "modified" | "checksum"
>,
): DatasetRegistration {
  const stats = fs.statSync(datasetPath);
  const fileBuffer = fs.readFileSync(datasetPath);

  const checksum = crypto
  .createHash("sha256")
  .update(fileBuffer)
  .digest("hex");

  return {
  ...manifest,

  path: datasetPath,

  size: stats.size,

  modified: stats.mtime,

  checksum,
};
}