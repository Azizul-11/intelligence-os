import {
  RelationshipCardinality,
  RelationshipType,
  type RelationshipDefinition,
} from "@intelligence/domain-sdk";

export const aboveComparisonRelationship: RelationshipDefinition = {
  id: "above-comparison",

  name: "above-comparison",

  displayName: "Above Comparison",

  description:
    "Comparison operator indicating a value is above a benchmark or threshold.",

  sourceEntity: "metric",

  targetEntity: "benchmark",

  type: RelationshipType.RELATED_TO,

  cardinality: RelationshipCardinality.MANY_TO_ONE,
} as const;
