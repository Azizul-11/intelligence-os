/** Picks which SQL template answers an ExecutionPlan, resolves its parameters, and flags cross-state geographic ambiguity before SQL runs. */
import type {
  DomainExecutionStrategy,
  EntityResolutionResult,
  SuggestionContext,
} from "@intelligence/domain-sdk";
import type { ExecutionPlan, ExecutionPlanMetric } from "@intelligence/contracts";

import { HealthcareTemplateSelector } from "./template-selector";
import { HealthcareParameterResolver } from "./parameter-resolver";
import { COUNTIES, CITIES } from "./geographic-directory";
import { normalizeText, STATES } from "./entity-provider";
import { hospitalIdentityDirectory } from "./hospital-identity-directory";
import { generateHealthcareSuggestionsWithLLMRephrasing } from "./suggestion-generator";
import { HOSPITAL_ATTRIBUTE_PARAMETERS, UNRATED_HOSPITAL_TYPES, UNRATED_OWNERSHIPS } from "./hospital-attribute-directory";
import { healthcareSqlTemplates } from "../sql";

export const STATE_NAMES_BY_CODE = new Map<string, string>(
  Array.from(STATES.entries()).map(([name, code]) => [
    code,
    // Batch 5B-5: "District of Columbia", not "District Of Columbia".
    name.replace(/\b\w/g, (letter) => letter.toUpperCase()).replace(/ Of /g, " of "),
  ]),
);

/** The metrics a concept's measureCodesByMetric can name, i.e. the ones that route by a measureCode filter. */
const MEASURE_CODE_METRICS = new Set(["mortality-rate", "readmission-rate", "patient-safety-indicator", "patient-experience"]);

/** Batch 5B-4: the declared parameters of every registered template, for the attribute-filter guard below. */
const TEMPLATE_PARAMETERS = new Map<string, Set<string>>(
  healthcareSqlTemplates.map((template) => [template.id, new Set((template.parameters ?? []).map((parameter) => parameter.name))]),
);

/** A single hospital's own dossier answers "is it birthing-friendly / does it have an ER?" from its columns. */
const DOSSIER_TEMPLATES = new Set(["hospital-detail", "hospital-detail-by-facility-ids"]);

export class HealthcareExecutionStrategy
  implements DomainExecutionStrategy
{
  private readonly templateSelector =
    new HealthcareTemplateSelector();

  private readonly parameterResolver =
    new HealthcareParameterResolver();

  /** Phase 7: Healthcare's result-identity column, read generically by Universal Core. */
  readonly resultIdentityField = "facility_id";

  selectTemplate(
    metricId: string,
    intent: string,
  ): string {
    return this.templateSelector.select(
      metricId,
      intent,
    );
  }

  resolveParameters(
    entities: Record<string, unknown>,
  ): Record<string, unknown> {
    return this.parameterResolver.resolve(
      entities,
    );
  }

  /** Pre-Phase 9 Tier0: city/county names colliding across states (ALBANY in NY and WY) are flagged ambiguous (0 SQL) before template selection;
   * skipped when a state filter or an explicit single-hospital filter already pins it down. */
  checkPlanAmbiguity(executionPlan: ExecutionPlan): EntityResolutionResult[] | undefined {
    const hasStateFilter = executionPlan.filters.some(
      (filter) => filter.field === "state",
    );
    const hospitalFilter = executionPlan.filters.find(
      (filter) => filter.field === "hospital",
    );
    const hasHospitalFilter = hospitalFilter !== undefined;

    // Tier0 Task 2 (F8): a single named hospital + ranking op ("Mayo Clinic best hospitals") is ambiguous, so it clarifies instead of the generic capability-mismatch refusal.
    if (
      executionPlan.operation === "rank" &&
      hospitalFilter &&
      hospitalFilter.operator === "="
    ) {
      const record = hospitalIdentityDirectory.find(
        (candidate) => candidate.facilityId === hospitalFilter.value,
      );

      if (record) {
        return [
          {
            found: false,
            entityId: "hospital",
            value: null,
            phrase: record.hospitalName,
            status: "ambiguous",
            candidates: [
              {
                value: { choice: "lookup", facilityId: record.facilityId, hospitalName: record.hospitalName },
                label: `${record.hospitalName}'s own rating`,
              },
              {
                value: { choice: "similar", facilityId: record.facilityId, hospitalName: record.hospitalName },
                label: `hospitals similar to ${record.hospitalName}`,
              },
            ],
          },
        ];
      }
    }

    if (hasStateFilter || hasHospitalFilter) {
      return undefined;
    }

    const geoFilter = executionPlan.filters.find(
      (filter) => filter.field === "county" || filter.field === "city",
    );

    if (!geoFilter) {
      // Batch 4: a star-rating filter with no state ("5 star hospitals") would return an arbitrary nationwide 10, so ask for a state. Grouped/aggregated requests are nationwide by design.
      const needsStateForStarFilter =
        executionPlan.filters.some((filter) => filter.field === "overallRating") &&
        !executionPlan.grouping &&
        executionPlan.operation !== "aggregate";

      return needsStateForStarFilter
        ? [
            {
              found: false,
              entityId: "state",
              value: null,
              phrase: "state",
              status: "ambiguous",
              candidates: [...STATE_NAMES_BY_CODE].map(([code, name]) => ({ value: code, label: name })),
            },
          ]
        : undefined;
    }

    const directory = geoFilter.field === "county" ? COUNTIES : CITIES;
    const geoValue = directory.get(normalizeText(String(geoFilter.value)));

    if (!geoValue || geoValue.states.length <= 1) {
      return undefined;
    }

    const phrase =
      geoFilter.field === "county" ? `${geoValue.canonical} County` : geoValue.canonical;

    return [
      {
        found: false,
        entityId: geoFilter.field,
        value: null,
        phrase,
        status: "ambiguous",
        candidates: geoValue.states.map((code) => ({
          value: code,
          label: STATE_NAMES_BY_CODE.get(code) ?? code,
        })),
      },
    ];
  }

  /**
   * Phase 5.3: selects a template from the ExecutionPlan. Batch 5B-4: a hospital-type/attribute filter also (1)
   * lists instead of ranks a CMS-unrated type (D11), (2) falls back to nationwide when no place is named, and
   * (3) refuses (0 SQL) when the chosen template doesn't declare the filter's parameter - except for a single
   * hospital's dossier, where the attribute is just a question about that hospital's own columns.
   */
  selectTemplateFromPlan(executionPlan: ExecutionPlan): string {
    const attributeFields = executionPlan.filters
      .map((filter) => filter.field)
      .filter((field) => (HOSPITAL_ATTRIBUTE_PARAMETERS as readonly string[]).includes(field));

    const hasHospitalFilter = executionPlan.filters.some((filter) => filter.field === "hospital");
    const hasPlace = executionPlan.filters.some((filter) => filter.field === "state" || filter.field === "county" || filter.field === "city");
    const ownership = executionPlan.filters.find((filter) => filter.field === "ownership")?.value;

    // Phase 3.5 (D11 for ownership): a CMS-unrated ownership (e.g. Department of Defense) is listed, not ranked - the ranking was empty by nature.
    if (!hasHospitalFilter && typeof ownership === "string" && UNRATED_OWNERSHIPS.has(ownership)) {
      return hasPlace ? "hospital-list-by-state" : "hospital-list-nationwide";
    }

    if (attributeFields.length === 0) {
      return this.selectTemplateForPlan(executionPlan);
    }

    const hospitalType = executionPlan.filters.find((filter) => filter.field === "hospitalType")?.value;
    const listTemplate = hasPlace ? "hospital-list-by-state" : "hospital-list-nationwide";

    if (!hasHospitalFilter && typeof hospitalType === "string" && UNRATED_HOSPITAL_TYPES.has(hospitalType)) {
      return listTemplate;
    }

    let templateId = this.selectTemplateForPlan(executionPlan);

    if (templateId === "hospital-list-by-state" && !hasPlace) {
      templateId = "hospital-list-nationwide";
    }

    const declared = TEMPLATE_PARAMETERS.get(templateId);

    if (!declared || attributeFields.every((field) => declared.has(field)) || (hasHospitalFilter && DOSSIER_TEMPLATES.has(templateId))) {
      return templateId;
    }

    return `${templateId}-without-hospital-attribute-filters`;
  }

  private selectTemplateForPlan(executionPlan: ExecutionPlan): string {
    // Tier1 Task 3: "hospital-detail" ("tell me about...") wins primary-metric position just because it's first in
    // the sentence, but if another metric also resolved ("...Mayo Clinic's mortality rate"), re-route to THAT
    // metric's own template instead of a generic profile lookup. Falls back to the default ranking metric only
    // when hospital-detail resolved with no other metric and no single hospital either.
    if (executionPlan.metric === "hospital-detail") {
      const otherMetric = executionPlan.metrics?.find(
        (candidate) => candidate.metric !== "hospital-detail",
      );

      if (otherMetric) {
        return this.selectTemplateFromPlan({
          ...executionPlan,
          metric: otherMetric.metric,
        });
      }

      const hasSingleHospitalFilter = executionPlan.filters.some(
        (filter) => filter.field === "hospital" && filter.operator === "=",
      );

      if (!hasSingleHospitalFilter) {
        return this.selectTemplateFromPlan({
          ...executionPlan,
          metric: "hospital-overall-rating",
        });
      }
    }

    // Tier0 Task 5 (F12 Sub-Task B): a `measureCode` filter routes to the matching condition-specific template
    // instead of the generic ranking one (which has no per-condition data). Falls through for any other metric.
    const measureCodeFilter = executionPlan.filters.find(
      (filter) => filter.field === "measureCode",
    );

    const hasHospitalFilter = executionPlan.filters.some(
      (filter) => filter.field === "hospital",
    );

    // Bug L Part B: must run BEFORE the generic ranking redirect below, else a condition-specific request (e.g.
    // "heart attack death rate") silently gets the generic template instead, which ignores measureCode entirely.
    // Never fires for a lookup naming a specific hospital - that keeps its own single-hospital template.
    // Batch 3/5B-2/5B-3: "hospitals in Florida for pneumonia mortality" names the listing phrase first, so the
    // positional primary metric is `hospital-list` and the condition's own measure would be silently dropped -
    // when a mortality/readmission/PSI/patient-experience measure is also present, that metric decides instead.
    const routedMetric =
      executionPlan.metric === "hospital-list" && measureCodeFilter
        ? (executionPlan.metrics?.find((candidate) => MEASURE_CODE_METRICS.has(candidate.metric))?.metric ?? executionPlan.metric)
        : executionPlan.metric;

    if (
      measureCodeFilter &&
      (executionPlan.operation === "rank" ||
        (executionPlan.operation === "lookup" && !hasHospitalFilter))
    ) {
      if (routedMetric === "mortality-rate") {
        return "hospital-condition-mortality-ranking";
      }

      if (routedMetric === "readmission-rate") {
        return "hospital-condition-readmission-ranking";
      }

      // Batch 5B-2: a PSI measureCode routes to its own ranking template, never the mortality one above.
      if (routedMetric === "patient-safety-indicator") {
        return "hospital-condition-safety-indicator-ranking";
      }

      // Batch 5B-3: a patient-survey dimension routes to its own ranking; the composite one (no measureCode) is unchanged.
      if (routedMetric === "patient-experience") {
        return "hospital-hcahps-dimension-ranking";
      }
    }

    // Phase 7.5.5: an explicit multi-hospital set ("in" filter) is always answered by fetching exactly those
    // facilities, regardless of wording ("compare", "list"). A single hospital falls through to intent-based selection.
    // Comparison full dossier fix: a dossier comparison (no explicit ranking metric) uses hospital-detail for the
    // full 22-field dossier per row, not just overall_rating.
    const explicitHospitalSet = executionPlan.filters.some(
      (filter) => filter.field === "hospital" && filter.operator === "in",
    );

    if (explicitHospitalSet) {
      const isDossierComparison =
        executionPlan.metric === "hospital-detail" ||
        executionPlan.metric === "hospital-overall-rating" ||
        !executionPlan.metric;

      if (isDossierComparison) {
        return this.templateSelector.select("hospital-detail", "byIds"); // full 22-field dossier, not just overall_rating
      }

      return this.templateSelector.select(executionPlan.metric, "byIds"); // non-dossier comparison (specific metric)
    }

    // Tier1 Task 5: a "compare" over 2+ states has no dedicated "<metric>-comparison" template (a separate,
    // pre-existing gap) - routes to the same multi-state-capable ranking/lookup template Phase 2 already built,
    // instead of failing with "SQL template not found." A single state falls through unchanged.
    const explicitStateSet = executionPlan.filters.some(
      (filter) => filter.field === "state" && filter.operator === "in",
    );

    if (executionPlan.operation === "compare" && explicitStateSet) {
      // Bug D: a `measureCode` filter must win here like it does for "rank" above - otherwise "Compare Readmission
      // Rates for Pneumonia in FL vs GA" silently fell through to the generic template (wrong data, no error).
      if (measureCodeFilter) {
        if (executionPlan.metric === "mortality-rate") {
          return "hospital-condition-mortality-ranking";
        }

        if (executionPlan.metric === "readmission-rate") {
          return "hospital-condition-readmission-ranking";
        }

        // Batch 5B-3: without this, a survey dimension compared across states fell through to the composite template.
        if (executionPlan.metric === "patient-experience") {
          return "hospital-hcahps-dimension-ranking";
        }
      }

      const intent = executionPlan.metric === "hospital-list" ? "lookup" : "ranking";
      return this.templateSelector.select(executionPlan.metric, intent);
    }

    // Bug L Part B: a "lookup"-shaped request with a rankable metric but no named hospital ("good safety") has
    // nothing for "lookup" to mean - routes to the ranking template instead of an avoidable "SQL template not
    // found." Excludes hospital-list/count/detail (real lookup capabilities, not gaps). Deliberately only changes
    // template selection, not `operation` itself - an earlier version flipped operation and broke dossier lookups.
    if (
      executionPlan.operation === "lookup" &&
      !hasHospitalFilter &&
      executionPlan.metric !== "hospital-list" &&
      executionPlan.metric !== "hospital-count" &&
      executionPlan.metric !== "hospital-detail"
    ) {
      return this.templateSelector.select(executionPlan.metric, "ranking");
    }

    const hasStateFilter = executionPlan.filters.some(
      (filter) => filter.field === "state",
    );

    // Pre-Phase 9 Tier0 Task 1: "for ALBANY county" (a filter) always uses the standard ranking template, never the
    // grouped dimensional one - "by county" (a dimension) is the only thing that groups. Fixes Trap A: 52 grouped
    // rows vs 4 filtered Albany County facilities.
    const hasCountyFilter = executionPlan.filters.some(
      (filter) => filter.field === "county",
    );
    const hasCityFilter = executionPlan.filters.some(
      (filter) => filter.field === "city",
    );

    // ConversationalFix follow-up: "how many hospitals in <county/city>" used to fall through to
    // HealthcareTemplateSelector's state-only hospital-count mapping and answer as a plain list, not a count.
    if (executionPlan.metric === "hospital-count" && executionPlan.operation === "aggregate") {
      if (hasCountyFilter) {
        return "hospital-count-by-county";
      }
      if (hasCityFilter) {
        return "hospital-count-by-city";
      }
    }

    // RCG-008: grouped ranking. Universal Core supplies an opaque dimension key; Healthcare maps it to its own
    // grouped SQL templates. Skipped when an explicit county/city filter is present (that's a scope, not a grouping).
    if (
      executionPlan.grouping &&
      executionPlan.grouping.dimensions.length > 0 &&
      !hasCountyFilter &&
      !hasCityFilter
    ) {
      const dimensionKey = executionPlan.grouping.dimensions[0]!;

      // Ratified Decision 2: county is high-cardinality (1,555 values) and needs a bounding state filter - without one, fail honestly rather than run an unbounded query.
      if (dimensionKey === "county-dimension" && !hasStateFilter) {
        return `${executionPlan.metric}-ranking-by-county-unbounded`;
      }

      return this.templateSelector.select(
        executionPlan.metric,
        "ranking-by-dimension",
        dimensionKey,
      );
    }

    // RCG-009: benchmark comparison. `benchmark.benchmark` is an opaque id only Healthcare interprets.
    if (executionPlan.benchmark) {
      // Ratified Decision 5: a bare "state average" with no state named is a clean failure, not a silently unscoped comparison.
      if (executionPlan.benchmark.benchmark === "state-average" && !hasStateFilter) {
        return `${executionPlan.metric}-ranking-benchmark-requires-state`;
      }

      return this.templateSelector.select(
        executionPlan.metric,
        "ranking-benchmark",
      );
    }

    // Map ExecutionOperation to intent
    const intentMap: Record<string, string> = {
      lookup: "lookup",
      rank: "ranking",
      aggregate: "aggregation",
      compare: "comparison",
      analyze: "trend",
    };

    const intent = intentMap[executionPlan.operation] || "lookup";

    return this.templateSelector.select(
      executionPlan.metric,
      intent,
    );
  }

  /** Phase 5.3: resolves parameters from an ExecutionPlan. */
  resolveParametersFromPlan(executionPlan: ExecutionPlan): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};

    for (const filter of executionPlan.filters) {
      parameters[filter.field] = filter.value;
    }

    // RCG-019: templates with no "direction" parameter just ignore this extra key.
    if (executionPlan.ordering) {
      parameters.direction = executionPlan.ordering.direction === "asc" ? "ASC" : "DESC";
    }

    if (executionPlan.benchmark) {
      parameters.benchmark = executionPlan.benchmark.benchmark;
      parameters.comparison = executionPlan.benchmark.comparison;
    }

    if (executionPlan.parameters) {
      Object.assign(parameters, executionPlan.parameters);
    }

    return this.parameterResolver.resolve(parameters);
  }

  /**
   * Phase 7: selects the template for fetching a secondary metric's values for the primary query's facility_ids.
   * Tier1 Task 3: when primary was redirected from hospital-detail to another metric, swaps this secondary slot
   * back to hospital-detail's profile fields, so the result carries both the metric row and the profile fields.
   */
  selectSecondaryMetricTemplate(
    metric: ExecutionPlanMetric,
    executionPlan: ExecutionPlan,
  ): string {
    if (executionPlan.metric === "hospital-detail" && metric.metric !== "hospital-detail") {
      const hasSingleHospitalFilter = executionPlan.filters.some(
        (filter) => filter.field === "hospital" && filter.operator === "=",
      );

      if (hasSingleHospitalFilter) {
        return "hospital-detail";
      }

      // Tier1 Task 3: a list-shaped redirect (e.g. hospital-list) has no "-by-facility-ids" template of its own; reuses the existing hospital-overall-rating one instead of failing on an unregistered id.
      return "hospital-overall-rating-by-facility-ids";
    }

    return this.templateSelector.select(metric.metric, "byIds");
  }

  /** Phase 7: resolves parameters for a secondary metric fetch - identity values are the primary query's own facility_ids. */
  resolveSecondaryMetricParameters(
    metric: ExecutionPlanMetric,
    executionPlan: ExecutionPlan,
    identityValues: readonly unknown[],
  ): Record<string, unknown> {
    // Tier1 Task 3: mirrors selectSecondaryMetricTemplate()'s swap - hospital-detail takes a single `hospitalId`, not array-shaped `facilityIds`. Safe since this only fires for exactly one resolved hospital.
    if (
      executionPlan.metric === "hospital-detail" &&
      metric.metric !== "hospital-detail" &&
      executionPlan.filters.some((filter) => filter.field === "hospital" && filter.operator === "=")
    ) {
      return {
        hospitalId: identityValues[0],
      };
    }

    return {
      facilityIds: identityValues,
    };
  }

  /** Tier1 Task 6 + LLM Layer 2: delegates to the Domain-owned generator - see suggestion-generator.ts. */
  async generateSuggestions(context: SuggestionContext): Promise<string[]> {
    return generateHealthcareSuggestionsWithLLMRephrasing(context);
  }
}