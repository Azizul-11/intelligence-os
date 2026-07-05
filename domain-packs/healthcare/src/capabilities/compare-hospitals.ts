import type { CapabilityDefinition } from "@intelligence/domain-sdk";

export const compareHospitalsCapability: CapabilityDefinition = {
  id: "compare-hospitals",

  name: "compare-hospitals",

  displayName: "Compare Hospitals",

  description:
    "Compare healthcare organizations across quality, safety, and performance metrics.",

  category: "comparison",

  enabled: true,
};