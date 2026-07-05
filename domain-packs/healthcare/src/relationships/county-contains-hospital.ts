import {
  RelationshipCardinality,
  RelationshipType,
  type RelationshipDefinition,
} from "@intelligence/domain-sdk";

export const countyContainsHospitalRelationship: RelationshipDefinition = {
  id: "county-contains-hospital",

  name: "county-contains-hospital",

  displayName: "County Contains Hospital",

  description:
    "A county contains one or more healthcare facilities.",

  sourceEntity: "county",

  targetEntity: "hospital",

  type: RelationshipType.CONTAINS,

  cardinality: RelationshipCardinality.ONE_TO_MANY,
} as const;