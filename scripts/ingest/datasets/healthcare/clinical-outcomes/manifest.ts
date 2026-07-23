export const hospitalClinicalOutcomesManifest = {
  id: "cms-hospital-clinical-outcomes",

  name: "CMS Hospital Clinical Outcomes",

  domain: "healthcare",

  provider: "Centers for Medicare & Medicaid Services",

  source: "CMS",

  version: "2026",

  format: "csv",

  requiredColumns: [
    "Facility ID",
    "Facility Name",
    "Measure ID",
    "Measure Name",
    "Compared to National",
    "Denominator",
    "Score",
    "Lower Estimate",
    "Higher Estimate",
    "Footnote",
    "Start Date",
    "End Date",
  ],
};