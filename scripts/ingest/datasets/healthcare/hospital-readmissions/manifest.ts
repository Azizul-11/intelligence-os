export const hospitalReadmissionsManifest = {
  id: "cms-hospital-readmissions",

  name: "CMS Hospital Readmissions Reduction Program",

  domain: "healthcare",

  provider: "Centers for Medicare & Medicaid Services",

  source: "CMS",

  version: "2026",

  format: "csv",

  requiredColumns: [
    "Facility ID",
    "Facility Name",
    "State",
    "Measure Name",
    "Number of Discharges",
    "Number of Readmissions",
    "Start Date",
    "End Date",
  ],
};