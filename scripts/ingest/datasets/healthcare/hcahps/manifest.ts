export const hospitalHcahpsManifest = {
  id: "cms-hospital-hcahps",

  name: "CMS Hospital HCAHPS",

  domain: "healthcare",

  provider: "Centers for Medicare & Medicaid Services",

  source: "CMS",

  version: "2026",

  format: "csv",

  requiredColumns: [
    "Facility ID",
    "Facility Name",
    "Address",
    "City",
    "State",
    "ZIP Code",
    "County Name",
    "Telephone Number",

    "HCAHPS Measure ID",
    "HCAHPS Question",
    "HCAHPS Answer Description",

    "Patient Survey Star Rating",
    "Patient Survey Star Rating Footnote",

    "HCAHPS Answer Percent",
    "HCAHPS Answer Percent Footnote",

    "HCAHPS Linear Mean Value",

    "Number of Completed Surveys",
    "Number of Completed Surveys Footnote",

    "Survey Response Rate Percent",
    "Survey Response Rate Percent Footnote",

    "Start Date",
    "End Date",
  ],
};