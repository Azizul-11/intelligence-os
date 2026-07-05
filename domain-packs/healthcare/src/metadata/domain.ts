// // import type { DomainMetadata } from "@intelligence/domain-sdk";

// // export const healthcareMetadata: DomainMetadata = {
// //   id: "healthcare",

// //   name: "healthcare",

// //   displayName: "Healthcare",

// //   description:
// //     "Healthcare Domain Pack for IntelligenceOS providing domain knowledge for healthcare analytics.",

// //   version: "1.0.0",

// //   vendor: "IntelligenceOS",

// //   supportedDatasets: [
// //     "cms_hospital_compare",
// //     "cms_hcahps",
// //     "cms_readmissions",
// //     "cms_mortality",
// //     "cms_timely_effective_care",
// //   ],
// // } as const;


// import type { DomainManifest } from "@intelligence/domain-sdk";

// import { healthcareMetadata } from "./domain";

// export const healthcareManifest: DomainManifest = {
//   metadata: healthcareMetadata,

//   configuration: {
//     enabled: true,

//     strictMode: true,

//     cacheEnabled: true,

//     experimental: false,

//     defaultLocale: "en-US",
//   },
// };


import type { DomainMetadata } from "@intelligence/domain-sdk";

export const healthcareMetadata: DomainMetadata = {
  id: "healthcare",

  name: "healthcare",

  displayName: "Healthcare",

  description:
    "Healthcare Domain Pack for IntelligenceOS providing domain knowledge for healthcare analytics.",

  version: "1.0.0",

  vendor: "IntelligenceOS",

  supportedDatasets: [
    "cms_hospital_compare",
    "cms_hcahps",
    "cms_readmissions",
    "cms_mortality",
    "cms_timely_effective_care",
  ],
};