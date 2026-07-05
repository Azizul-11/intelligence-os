import {
  RelationshipCardinality,
  RelationshipType,
  type RelationshipDefinition,
} from "@intelligence/domain-sdk";

export const hospitalReportsMetricRelationship: RelationshipDefinition = {
  id: "hospital-reports-metric",

  name: "hospital-reports-metric",

  displayName: "Hospital Reports Metric",

  description:
    "Hospitals publish measurable quality, operational, and performance metrics.",

  sourceEntity: "hospital",

  targetEntity: "metric",

  type: RelationshipType.MEASURES,

  cardinality: RelationshipCardinality.ONE_TO_MANY,
} as const;