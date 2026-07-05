import {
  RelationshipCardinality,
  RelationshipType,
  type RelationshipDefinition,
} from "@intelligence/domain-sdk";

export const hospitalHasDepartmentRelationship: RelationshipDefinition = {
  id: "hospital-has-department",

  name: "hospital-has-department",

  displayName: "Hospital Has Department",

  description:
    "A hospital contains one or more clinical or operational departments.",

  sourceEntity: "hospital",

  targetEntity: "department",

  type: RelationshipType.CONTAINS,

  cardinality: RelationshipCardinality.ONE_TO_MANY,
} as const;