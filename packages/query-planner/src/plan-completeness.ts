/** Detects a resolved semantic candidate missing from the ExecutionPlan (silent-wrong shape, F12/F13); detection only. Relationship-typed candidates are not checked. */
import type { SemanticCandidate } from "@intelligence/semantic";
import type { EntityDefinition, ConceptDefinition } from "@intelligence/domain-sdk";
import type { ExecutionPlan } from "@intelligence/contracts";
import type { SemanticCollections } from "./semantic-collections";

export interface PlanCompletenessDiscrepancy {
  semanticType: SemanticCandidate["semanticType"];
  phrase: string;
  canonicalKey: string;
  reason: string;
}

export interface PlanCompletenessReport {
  complete: boolean;
  discrepancies: PlanCompletenessDiscrepancy[];
}

export function assessPlanCompleteness(
  candidates: readonly SemanticCandidate[],
  plan: ExecutionPlan,
  plannedSemantic: SemanticCollections,
): PlanCompletenessReport {
  const discrepancies: PlanCompletenessDiscrepancy[] = [];

  const planMetricKeys = new Set<string>([
    plan.metric,
    ...(plan.metrics?.map((metric) => metric.metric) ?? []),
  ]);

  // Phase 8.2: metric keys that survived QueryPlanner's own filtering - missing from this set means intentionally removed, not silently lost.
  const plannedMetricKeys = new Set(
    plannedSemantic.metrics.map((metric) => metric.canonicalKey),
  );

  const filterValues = new Set<unknown>();

  for (const filter of plan.filters) {
    if (Array.isArray(filter.value)) {
      for (const value of filter.value) {
        filterValues.add(value);
      }
    } else {
      filterValues.add(filter.value);
    }
  }

  const groupingDimensions = new Set(plan.grouping?.dimensions ?? []);

  // RCG-009's longest-span-wins rule already decides which benchmark candidate survives - re-derived here, not a second policy.
  const benchmarkCandidates = candidates.filter(
    (candidate) => candidate.semanticType === "benchmark",
  );

  const primaryBenchmark = [...benchmarkCandidates].sort(
    (a, b) => (b.end - b.start) - (a.end - a.start),
  )[0];

  const hasRelationship = candidates.some(
    (candidate) => candidate.semanticType === "relationship",
  );

  for (const candidate of candidates) {
    if (candidate.semanticType === "metric") {
      // Legitimately removed by planner filtering - not a discrepancy.
      if (!plannedMetricKeys.has(candidate.canonicalKey)) {
        continue;
      }

      if (!planMetricKeys.has(candidate.canonicalKey)) {
        discrepancies.push({
          semanticType: candidate.semanticType,
          phrase: candidate.phrase,
          canonicalKey: candidate.canonicalKey,
          reason:
            "Resolved metric candidate does not appear in plan.metric or plan.metrics.",
        });
      }

      continue;
    }

    if (candidate.semanticType === "entity") {
      const definition = candidate.definition as EntityDefinition;

      if (!definition.execution) {
        // No execution metadata - not expected to contribute a filter.
        continue;
      }

      const value = candidate.resolvedValue ?? candidate.phrase;

      if (!filterValues.has(value)) {
        discrepancies.push({
          semanticType: candidate.semanticType,
          phrase: candidate.phrase,
          canonicalKey: candidate.canonicalKey,
          reason:
            "Resolved entity candidate's value does not appear in any plan.filters entry.",
        });
      }

      continue;
    }

    if (candidate.semanticType === "dimension") {
      if (!groupingDimensions.has(candidate.canonicalKey)) {
        discrepancies.push({
          semanticType: candidate.semanticType,
          phrase: candidate.phrase,
          canonicalKey: candidate.canonicalKey,
          reason:
            "Resolved dimension candidate does not appear in plan.grouping.",
        });
      }

      continue;
    }

    if (candidate.semanticType === "category") {
      // No mechanism reads category candidates - an architectural gap (F13).
      discrepancies.push({
        semanticType: candidate.semanticType,
        phrase: candidate.phrase,
        canonicalKey: candidate.canonicalKey,
        reason:
          "Category candidates are not consumed by any existing planning mechanism.",
      });

      continue;
    }

    if (candidate.semanticType === "concept") {
      // Accounted for when its measureCodesByMetric map produced a real measureCode filter (F12).
      const definition = candidate.definition as ConceptDefinition;
      const measureCodesByMetric = definition.measureCodesByMetric;

      const consumedAsMeasureCodeFilter =
        measureCodesByMetric !== undefined &&
        plan.filters.some(
          (filter) =>
            filter.field === "measureCode" &&
            Object.values(measureCodesByMetric).includes(filter.value as string),
        );

      if (!consumedAsMeasureCodeFilter) {
        discrepancies.push({
          semanticType: candidate.semanticType,
          phrase: candidate.phrase,
          canonicalKey: candidate.canonicalKey,
          reason:
            "Concept candidates are not collected by SemanticCollector and never reach the planner.",
        });
      }

      continue;
    }

    if (candidate.semanticType === "benchmark") {
      if (!hasRelationship) {
        // buildBenchmark() requires a relationship candidate first.
        continue;
      }

      if (candidate === primaryBenchmark) {
        if (plan.benchmark?.benchmark !== candidate.canonicalKey) {
          discrepancies.push({
            semanticType: candidate.semanticType,
            phrase: candidate.phrase,
            canonicalKey: candidate.canonicalKey,
            reason:
              "The most specific resolved benchmark candidate does not match plan.benchmark.",
          });
        }
      }

      // A non-primary benchmark is superseded by the longest-span-wins rule.
      continue;
    }

    // "relationship" candidates: not checked, by documented design above.
  }

  return {
    complete: discrepancies.length === 0,
    discrepancies,
  };
}
