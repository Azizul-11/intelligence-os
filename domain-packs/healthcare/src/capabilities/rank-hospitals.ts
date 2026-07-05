import type { CapabilityDefinition } from "@intelligence/domain-sdk";

export const rankHospitalsCapability: CapabilityDefinition = {
  id: "rank-hospitals",

  name: "rank-hospitals",

  displayName: "Rank Hospitals",

  description:
    "Rank hospitals using registered healthcare metrics.",

  category: "ranking",

  enabled: true,
};