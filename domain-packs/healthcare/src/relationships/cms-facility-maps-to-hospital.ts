import {
  RelationshipCardinality,
  RelationshipType,
  type RelationshipDefinition,
} from "@intelligence/domain-sdk";

export const cmsFacilityMapsToHospitalRelationship: RelationshipDefinition = {
  id: "cms-facility-maps-to-hospital",

  name: "cms-facility-maps-to-hospital",

  displayName: "CMS Facility Maps To Hospital",

  description:
    "A CMS facility record references a hospital represented within IntelligenceOS.",

  sourceEntity: "cms-facility",

  targetEntity: "hospital",

  type: RelationshipType.REFERENCES,

  cardinality: RelationshipCardinality.ONE_TO_ONE,
} as const;