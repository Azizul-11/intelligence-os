import { healthcareVisualizers } from "./healthcare-ui";
import type { DomainConfig } from "./types";

// Healthcare is the first domain SDK: CMS Care Compare hospital data.
export const healthcare: DomainConfig = {
  id: "healthcare",
  label: "Healthcare",
  status: "live",
  description:
    "Registered against CMS Care Compare's full public dataset: hospitals, conditions, and patient-experience measures, resolved through the same core every domain shares.",
  features: [
    "56-column clinical dossiers per facility",
    "Condition-specific mortality and readmission rankings",
    "CMS benchmark badges (better, no different, or worse than the national rate)",
    "Aligned side-by-side facility comparisons",
  ],
  // Read straight from the healthcare identity directory (no copy). Loaded as its own chunk, so it stays off the main bundle
  // until the chat page asks for it.
  facilityNames: () =>
    import("../../../../domain-packs/healthcare/src/runtime/hospital-identity-directory").then(({ hospitalIdentityDirectory }) =>
      Object.fromEntries(hospitalIdentityDirectory.map((record) => [record.facilityId, record.hospitalName])),
    ),
  visualizers: healthcareVisualizers,
  chat: {
    placeholder: "Ask about a hospital, a state, or a condition",
    compactPlaceholder: "Ask about a hospital…",
    examplePrompts: [
        "Stroke mortality rate in Ohio",
        "Hospitals with the best patient safety scores",
        "Lowest pneumonia readmission rates nationwide",
        "Hospital room and bathroom cleanliness ranking",
        "Nurse communication scores in Florida",
        "Hospitals in Texas",
        "Hospitals in Puerto Rico",
        "Hospitals in Oregon and Washington",
        "Military hospitals",
        "Show me government-owned hospitals that treat heart attacks.",
        "Non-profit hospitals in Florida ranked by pneumonia mortality",
        "Dossier on Cleveland Clinic",
        "Complete profile of Cedars-Sinai Medical Center",
        "Compare Memorial Medical Center in Illinois and Memorial Medical Center in Texas",
        "Best hospitals in Wisconsin",
        "Hospitals in New York City",
        "Best hospitals in Minnesota, Wisconsin, and Iowa",
        "Hospitals in Wayne County, Michigan",
        "Hospitals in Cook County, Illinois, ranked by mortality",
        "Hospitals in Miami, Florida",
        "Hospitals in Chicago ranked by mortality",
        "Does Mayo Clinic offer emergency services?",
        "Hip replacement best hospital in Ohio",
        "Critical access hospitals in Minnesota with the lowest heart failure mortality",
        "Hospitals with the lowest stroke mortality",
        "Which hospitals have the best PSI 90 score in Kentucky?",
        "Hospitals in Pennsylvania with the best doctor communication scores",
        "Hospitals with the best quietness scores in Oklahoma City",
        "Faith-based hospitals in New York",
        "Hospitals with emergency services in San Juan, Puerto Rico",
        "Hospitals with emergency services in Washington, DC",
        "For-profit acute hospitals best rated",
        "Top public hospitals in Illinois by star rating and patient experience",
    ],
  },
};
