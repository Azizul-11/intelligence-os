import fs from "node:fs";

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
}

export function registerDataset(
  datasetPath: string,
): DatasetRegistration {
  const stats = fs.statSync(datasetPath);

  return {
    id: "cms-hospital-general-information",

    name: "CMS Hospital General Information",

    domain: "healthcare",

    provider: "Centers for Medicare & Medicaid Services",

    source: "CMS",

    format: "csv",

    version: "2025",

    path: datasetPath,

    size: stats.size,

    modified: stats.mtime,
  };
}