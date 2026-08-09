import {
  RelationshipCardinality,
  RelationshipType,
  type RelationshipDefinition,
} from "@intelligence/domain-sdk";

export const belowComparisonRelationship: RelationshipDefinition = {
  id: "below-comparison",

  name: "below-comparison",

  displayName: "Below Comparison",

  description:
    "Comparison operator indicating a value is below a benchmark or threshold.",

  sourceEntity: "metric",

  targetEntity: "benchmark",

  type: RelationshipType.RELATED_TO,

  cardinality: RelationshipCardinality.MANY_TO_ONE,
} as const;
