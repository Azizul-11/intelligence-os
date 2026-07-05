import {
  RelationshipCardinality,
  RelationshipType,
  type RelationshipDefinition,
} from "@intelligence/domain-sdk";

export const departmentBelongsToHospitalRelationship: RelationshipDefinition = {
  id: "department-belongs-to-hospital",

  name: "department-belongs-to-hospital",

  displayName: "Department Belongs To Hospital",

  description:
    "A department belongs to a single healthcare organization.",

  sourceEntity: "department",

  targetEntity: "hospital",

  type: RelationshipType.BELONGS_TO,

  cardinality: RelationshipCardinality.MANY_TO_ONE,
} as const;