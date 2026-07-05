import {
  RelationshipCardinality,
  RelationshipType,
  type RelationshipDefinition,
} from "@intelligence/domain-sdk";

export const providerWorksInDepartmentRelationship: RelationshipDefinition = {
  id: "provider-works-in-department",

  name: "provider-works-in-department",

  displayName: "Provider Works In Department",

  description:
    "Healthcare providers are associated with departments where they deliver services.",

  sourceEntity: "provider",

  targetEntity: "department",

  type: RelationshipType.ASSOCIATED_WITH,

  cardinality: RelationshipCardinality.MANY_TO_ONE,
} as const;