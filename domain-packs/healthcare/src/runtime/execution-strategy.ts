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
import { HOSPITAL_ATTRIBUTE_PARAMETERS, UNRATED_HOSPITAL_TYPES } from "./hospital-attribute-directory";
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

  /**
   * Phase 7: Healthcare's own result-identity column. Universal Core
   * reads this generically - it never contains this string itself.
   */
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

  /**
   * Pre-Phase 9 Tier0: cross-state geographic collision guard, reported
   * through the Universal `checkPlanAmbiguity` hook rather than a
   * synthetic/unregistered template id. Many county/city names exist in
   * more than one state (e.g. ALBANY county is both NY and WY) - without
   * an accompanying state filter, binding just `:county`/`:city` to SQL
   * would silently mix facilities from unrelated states into one result
   * set. Runtime-engine calls this BEFORE any template selection or SQL
   * execution, so a non-empty result here always yields
   * `answerability: {status: "ambiguous", reason: "identity-ambiguous"}`
   * with zero SQL calls (Phase 8.13 invariant) - the same targeted-
   * clarification gate (Phase 8.3) already used for hospital-identity
   * ambiguity, with candidates as the colliding states themselves.
   *
   * When a state filter IS present elsewhere in the same request (e.g.
   * "...in New York for ALBANY county"), the geographic scope is already
   * fully coherent within this single turn - no ambiguity to report.
   *
   * Also skipped whenever an explicit "hospital" identity filter is
   * present (e.g. "Mayo Clinic Jacksonville"): a specific, already-
   * uniquely-resolved facility already fully determines which record(s)
   * the template targets, exactly as the redundant-filter reasoning in
   * runtime-engine's own Phase 8.8 gate already establishes for a
   * "state" filter alongside a "hospital" filter - a co-occurring
   * geographic mention here is corroborating detail about a hospital
   * that's already pinned down, not an independent, unresolved scope the
   * user is asking to filter by.
   */
  checkPlanAmbiguity(executionPlan: ExecutionPlan): EntityResolutionResult[] | undefined {
    const hasStateFilter = executionPlan.filters.some(
      (filter) => filter.field === "state",
    );
    const hospitalFilter = executionPlan.filters.find(
      (filter) => filter.field === "hospital",
    );
    const hasHospitalFilter = hospitalFilter !== undefined;

    // Tier0 Task 2 (F8): a single named hospital combined with a ranking
    // operation ("Mayo Clinic best hospitals", "highest rated hospital for
    // Mayo Clinic") reaches runtime-engine's own Phase 8.8 filter-
    // compatibility gate (create-runtime-engine.ts, "(F8)") - the generic
    // national ranking template has no parameter for a single facility_id,
    // so the request is already refused safely (SQL=0) rather than
    // silently executed with the hospital dropped. That refusal message
    // was a generic capability-mismatch string, not a targeted
    // clarification - the request is genuinely ambiguous (subject vs
    // reference-point, per the Tier0 Task 2 product design decision), not
    // merely incompatible. Reported here instead so it reaches the user
    // as a real clarification with real candidates, reusing the exact
    // same mechanism as the geographic case below. Scoped to a SINGLE
    // hospital with operator "=" only - an explicit multi-hospital "in"
    // set (Phase 7.5.5 comparison) always carries operation "compare",
    // never "rank", so it can never reach this branch, but the operator
    // check is kept as a second, explicit guard against ever silently
    // guessing which of several named hospitals this would be about.
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
      // Batch 4: a star-rating filter with no geographic scope at all ("show
      // me 5 star hospitals") would return an arbitrary 10 of the nationwide
      // matches as if that answered the question, so it asks for a state. A
      // grouped or aggregated request ("how many 5 star hospitals by state")
      // is nationwide by design and is left alone.
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
   * Phase 5.3: Select template using ExecutionPlan.
   *
   * Batch 5B-4: a hospital-type or attribute-flag filter (hospitalType, emergencyServices, birthingFriendly) decides
   * three things on top of the ordinary selection:
   * - D11: a type CMS never rates (psychiatric, children's, rural emergency) has no ranking to return, so it is listed
   *   instead, and the answer's note says why (hospital-attribute-directory.ts);
   * - a list with no place named uses the nationwide list (hospital-list-by-state requires a state);
   * - a template that does not declare the filter's parameter would silently drop it (runtime-engine leaves an
   *   undeclared scalar filter alone), so the request goes to an unregistered id instead: an honest refusal with 0 SQL,
   *   and alternative discovery then only offers metrics whose template honours the filter. A single named hospital's
   *   dossier is the exception: there the attribute is a question about that hospital, answered from its columns.
   */
  selectTemplateFromPlan(executionPlan: ExecutionPlan): string {
    const attributeFields = executionPlan.filters
      .map((filter) => filter.field)
      .filter((field) => (HOSPITAL_ATTRIBUTE_PARAMETERS as readonly string[]).includes(field));

    if (attributeFields.length === 0) {
      return this.selectTemplateForPlan(executionPlan);
    }

    const hasHospitalFilter = executionPlan.filters.some((filter) => filter.field === "hospital");
    const hasPlace = executionPlan.filters.some((filter) => filter.field === "state" || filter.field === "county" || filter.field === "city");
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
    // Tier1 Task 3: "hospital-detail" (the "tell me about"/"what can you
    // tell me about"/etc. metric - see aliases/hospital-detail.ts) is a
    // single-record-only profile lookup with no analytical capability at
    // all. When Universal Core's own, purely positional primary-metric
    // choice (whichever metric phrase appeared first in the text - see
    // ExecutionPlanMapper.extractPrimaryMetric()) picks "hospital-detail"
    // as primary merely because a conversational prefix happened to come
    // first, but ANOTHER metric was also resolved in the same sentence -
    // whether a real condition-bearing metric ("Tell me about Mayo
    // Clinic's mortality rate for heart attack") or another bare-scope
    // metric like "hospital-list" ("Tell me about hospitals in Texas",
    // where "hospitals in" is itself a registered hospital-list alias -
    // see aliases/hospital-list.ts) - silently answering with
    // hospital-detail's own generic profile lookup would discard the
    // actual, more specific question the user asked, or (for a scope-only
    // request hospital-detail's own single-hospitalId template can never
    // serve) reach Gate 6's generic "missing required parameter" refusal
    // where the request would otherwise have succeeded. Re-routes
    // template selection to whichever OTHER metric already resolved,
    // reusing that metric's own existing routing logic unchanged (via a
    // plan with `metric` swapped, recursively). Falls back to the
    // domain's declared default ranking metric only in the residual case
    // where hospital-detail resolved with no other metric AND no single
    // hospital either (hospital-detail alone with an actual single
    // hospital - e.g. "Tell me about Mayo Clinic" - is deliberately left
    // untouched below, since it is a working, desirable profile lookup).
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

    // Tier0 Task 5 (F12 Sub-Task B): a `measureCode` filter (built
    // generically by Universal Core's ExecutionPlanMapper.buildFilters()
    // from a resolved concept candidate's own Domain-declared
    // `measureCodesByMetric` map) routes to the matching condition-
    // specific detail-table template instead of the generic, population-
    // aggregate ranking template - the latter has no per-condition data
    // at all. Falls through to the standard selection below for any
    // other metric (no condition-specific template exists for it, so
    // the concept candidate remains unconsumed and is safely refused by
    // the existing Phase 8.8 completeness gate instead).
    const measureCodeFilter = executionPlan.filters.find(
      (filter) => filter.field === "measureCode",
    );

    // Bug L Part B: hoisted above the measureCodeFilter check below (was
    // previously computed further down, once, only for the generic
    // no-ranking-word redirect) so BOTH branches share one definition.
    // A single named hospital must never be silently dropped by either
    // branch - the F8 checkPlanAmbiguity gate above this method already
    // catches a named hospital combined with an actual "rank" operation
    // before either of these ever runs.
    const hasHospitalFilter = executionPlan.filters.some(
      (filter) => filter.field === "hospital",
    );

    // Scoped to "rank" OR the same no-ranking-word "lookup" shape Bug L
    // Part B's own redirect below now also resolves (e.g. "heart attack
    // death rate" - a bare condition mention with no ranking word) -
    // WITHOUT this broadened condition, that redirect (further down)
    // would route a condition-specific request to the GENERIC, non-
    // condition-specific ranking template instead (wrong data, silently:
    // confirmed live via verify-concept-ranking-direction.ts returning
    // real rows with none of the requested measure's own columns) since
    // it has no knowledge of `measureCode` at all - this check must run
    // BEFORE that generic redirect for the correct, condition-specific
    // template to win. Still never fires for a "lookup"-shaped request
    // that also names a specific hospital (`hasHospitalFilter`) - that
    // must keep using the existing single-hospital lookup template,
    // which returns every measure code for that one facility; routing it
    // to the population-wide condition-ranking template instead would
    // silently drop the hospital filter (the new template declares no
    // hospital/hospitalId parameter at all) - exactly the F8 entity-drop
    // shape Tier0 Task 2 already closed elsewhere.
    // Batch 3: "non-profit hospitals in Florida for pneumonia mortality" names the metric AFTER the listing phrase
    // "hospitals in", so the plan's positional primary metric is `hospital-list` and the condition's own measure
    // (already resolved into `measureCode`) was silently dropped: a plain 97-row Florida listing answered a pneumonia
    // mortality question. When the plan carries a condition measure and a mortality / readmission metric alongside the
    // listing metric, that metric decides the template; the ownership / state filters still ride along.
    // Batch 5B-2/5B-3: the same holds for the patient-safety-indicator and patient-experience measures (a survey
    // dimension or a PSI named after "hospitals in <place>" would otherwise be dropped for a plain listing).
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

      // Batch 5B-2: a patient-safety-indicator measureCode (PSI_03..PSI_15, PSI_90) routes to its own ranking
      // template - never to the mortality one above (a complication/death-after-complication rate is not a
      // mortality rate; see concepts/psi.ts's own comment on the pre-existing COMP_HIP_KNEE mislabeling this
      // deliberately avoids repeating).
      if (routedMetric === "patient-safety-indicator") {
        return "hospital-condition-safety-indicator-ranking";
      }

      // Batch 5B-3: a patient-survey dimension (concepts/hcahps-dimensions.ts) routes to its own ranking; the
      // composite patient-experience-ranking (no measureCode) is unchanged.
      if (routedMetric === "patient-experience") {
        return "hospital-hcahps-dimension-ranking";
      }
    }

    // Phase 7.5.5: when the request names an explicit set of hospitals
    // (more than one distinct resolved facility_id under the "hospital"
    // execution parameter, carried as Phase 7.5.3's "in" filter), the
    // request is always answered by fetching exactly those facilities -
    // the same deterministic "by-facility-ids" capability Phase 7
    // already established for secondary-metric enrichment - regardless
    // of surface intent wording ("compare", "list", etc.). A single
    // resolved hospital, or no hospital at all, falls through to the
    // existing intent-based selection below, unchanged.
    //
    // Comparison full dossier fix: for dossier comparison (2,3+ hospitals
    // with no explicit ranking metric), use hospital-detail metric instead
    // of hospital-overall-rating to get full 22-field dossier per row, not
    // just overall_rating. Detects dossier comparison by checking if metric
    // is hospital-detail, hospital-overall-rating, or no metric resolved
    // (bare comparison like "Mayo vs Cleveland" with no metric phrase).
    const explicitHospitalSet = executionPlan.filters.some(
      (filter) => filter.field === "hospital" && filter.operator === "in",
    );

    if (explicitHospitalSet) {
      const isDossierComparison =
        executionPlan.metric === "hospital-detail" ||
        executionPlan.metric === "hospital-overall-rating" ||
        !executionPlan.metric;

      if (isDossierComparison) {
        // Return full dossier (22 fields) for each hospital, not just overall_rating
        return this.templateSelector.select("hospital-detail", "byIds");
      }

      // Non-dossier comparison (e.g., specific metric like mortality-rate)
      return this.templateSelector.select(executionPlan.metric, "byIds");
    }

    // Tier1 Task 5 (Phase 3): when the request names an explicit set of
    // 2+ states (Phase 7.5.3's "in" filter on the "state" execution
    // parameter) under a "compare" operation ("Compare hospital ratings
    // in Texas and California"), there is no dedicated "<metric>-
    // comparison" template for any metric at all - a separate, pre-
    // existing gap (see docs/pre-phase9/tier1-t5/TIER1_T5_MULTISTATE_AUDIT.md's
    // Root Cause C), unrelated to state count. Falling through to the
    // standard intent-based selection below would otherwise resolve to
    // that never-registered `${metric}-comparison` id and fail with "SQL
    // template not found." Routes instead to the SAME multi-state-
    // capable template ("ranking" intent for an analytical metric,
    // "lookup" intent for the bare "hospital-list" metric) Phase 2
    // already made capable of a `state IN (:states)` scope - reusing
    // 100% of Phase 2's own work, no new SQL template, no new mechanism.
    // A single resolved state, or no state at all, falls through to the
    // existing intent-based selection below unchanged (a "compare" with
    // 0-1 states remains the separate, out-of-scope Root Cause C gap).
    const explicitStateSet = executionPlan.filters.some(
      (filter) => filter.field === "state" && filter.operator === "in",
    );

    if (executionPlan.operation === "compare" && explicitStateSet) {
      // Bug D (Phase 3.2, 2026-09-18): a condition-specific `measureCode`
      // filter must win here exactly as it already does for the "rank"
      // branch above (lines ~276-288) - without this check, "Compare
      // Readmission Rates for Pneumonia in Florida vs Georgia" silently
      // fell through to the generic `${metric}-ranking` template below,
      // which has no `measureCode` parameter at all and simply ignores
      // it - a real, silent-wrong result (generic readmission COUNTS
      // instead of the pneumonia-specific measure), confirmed live, with
      // no error signal whatsoever. The condition-specific templates
      // already support multi-state comparison unchanged (Tier1 Task 5's
      // own `states`/`multiState` parameters, populated generically by
      // `HealthcareParameterResolver` regardless of which template ends
      // up selected) - this reuses that existing capability rather than
      // building a new one, exactly mirroring the "rank" branch's own
      // two condition-specific template ids.
      if (measureCodeFilter) {
        if (executionPlan.metric === "mortality-rate") {
          return "hospital-condition-mortality-ranking";
        }

        if (executionPlan.metric === "readmission-rate") {
          return "hospital-condition-readmission-ranking";
        }

        // Batch 5B-3: without this, a survey dimension compared across states fell through to the composite
        // patient-experience-ranking below, which ignores measureCode - a silently different answer.
        if (executionPlan.metric === "patient-experience") {
          return "hospital-hcahps-dimension-ranking";
        }
      }

      const intent = executionPlan.metric === "hospital-list" ? "lookup" : "ranking";
      return this.templateSelector.select(executionPlan.metric, intent);
    }

    // Bug L Part B (2026-09-15): a "lookup"-shaped request (no ranking
    // word detected by QueryIntentDetector) that resolved a genuinely
    // rankable metric but named no specific hospital to look up (e.g.
    // "good safety"/"good saftey" -> safety-performance, via this
    // fix's own new literal aliases in aliases/safety-performance.ts)
    // has nothing for "lookup" to mean - HealthcareTemplateSelector's
    // own "lookup" mapping for a metric with no special-cased entry is
    // just the bare metric id, never itself a registered template
    // (only "<metric>-ranking" is), producing an avoidable "SQL
    // template not found." rather than the same nationwide top-10 a
    // ranking-worded phrasing of the identical metric already returns.
    // Deliberately excludes "hospital-list"/"hospital-count" (their own
    // explicit, correct "lookup" mappings in HealthcareTemplateSelector
    // are a real, working capability, not a gap) and "hospital-detail"
    // (handled by its own branch above - a genuine single-record
    // profile, not a ranking). Does not touch `executionPlan.operation`
    // itself, only which template this one selection resolves to, so
    // `checkPlanAmbiguity()`'s own `operation === "rank"` F8 gate above
    // is entirely unaffected - confirmed live: an earlier version of
    // this fix instead added "good"/"great" to Universal Core's
    // RANKING_KEYWORDS, which flipped `operation` itself to "rank" and
    // broke previously-working single-hospital dossier lookups (e.g.
    // "tell me about Good Samaritan Hospital") by routing them into
    // that same F8 gate - reverted in favor of this narrower,
    // template-selection-only fix. `hasHospitalFilter` itself is
    // computed once, above, shared with the measureCodeFilter check.
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

    // Pre-Phase 9 Tier0 Task 1: Geographic filter vs dimension invariant.
    // When an explicit county or city filter is present (e.g., "for ALBANY
    // county" → filter field="county" value="ALBANY"), the request is
    // always a scope filter on a ranking query - use the standard ranking
    // template with :county or :city bound, NOT the grouped dimensional
    // template (hospital-overall-rating-ranking-by-county). Grouped
    // dimensional templates are selected ONLY when:
    // 1. executionPlan.grouping.dimensions explicitly contains the
    //    dimension key (e.g., "county-dimension"), AND
    // 2. No specific county/city filter exists in executionPlan.filters
    //
    // This fixes Trap A: "by county" (dimension) vs "for ALBANY county"
    // (filter) - the former returns 52 grouped rows, the latter returns
    // 4 filtered facilities in Albany County.
    const hasCountyFilter = executionPlan.filters.some(
      (filter) => filter.field === "county",
    );
    const hasCityFilter = executionPlan.filters.some(
      (filter) => filter.field === "city",
    );

    // RCG-008: grouped ranking. Universal Core only ever supplies an
    // opaque dimension canonical key on ExecutionPlan.grouping -
    // Healthcare owns the mapping from that key to its own grouped SQL
    // templates and column names (see HealthcareTemplateSelector).
    //
    // Pre-Phase 9 Tier0 Task 1: Skip grouping when explicit geographic
    // filters (county/city) are present - those are scope filters, not
    // dimensional groupings.
    if (
      executionPlan.grouping &&
      executionPlan.grouping.dimensions.length > 0 &&
      !hasCountyFilter &&
      !hasCityFilter
    ) {
      const dimensionKey = executionPlan.grouping.dimensions[0]!;

      // Ratified Decision 2: county is high-cardinality (1,555 distinct
      // values in the real warehouse) and requires a bounding state
      // filter. Without one, deliberately resolve to an unregistered
      // template id (the same honest "SQL template not found" failure
      // used for every other genuinely unsupported request) rather than
      // executing an unbounded, ~1,555-row query.
      if (dimensionKey === "county-dimension" && !hasStateFilter) {
        return `${executionPlan.metric}-ranking-by-county-unbounded`;
      }

      return this.templateSelector.select(
        executionPlan.metric,
        "ranking-by-dimension",
        dimensionKey,
      );
    }

    // RCG-009: benchmark comparison. `executionPlan.benchmark.benchmark`
    // is an opaque canonical id from Healthcare's own benchmark
    // registry - only Healthcare (never Universal Core) interprets it.
    if (executionPlan.benchmark) {
      // Ratified Decision 5: a bare "state average" benchmark with no
      // state named anywhere in the query is a clean failure, not a
      // silently unscoped (or silently zero-row) comparison.
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

  /**
   * Phase 5.3: Resolve parameters using ExecutionPlan.
   */
  resolveParametersFromPlan(executionPlan: ExecutionPlan): Record<string, unknown> {
    const parameters: Record<string, unknown> = {};

    // Convert filters to parameters
    for (const filter of executionPlan.filters) {
      parameters[filter.field] = filter.value;
    }

    // RCG-019: pass the plan's already-resolved sort direction through
    // to any SQL template that declares a "direction"-typed parameter.
    // Templates that don't declare one simply ignore this extra key -
    // SqlExecutor only substitutes parameters a template explicitly
    // names. Omitted (not just falsy) when the plan carries no
    // ordering at all (e.g. non-ranking operations, or the still-out-
    // of-scope multi-metric case - see Fix Cycle 008), so a template's
    // own default direction behavior is unaffected.
    if (executionPlan.ordering) {
      parameters.direction = executionPlan.ordering.direction === "asc" ? "ASC" : "DESC";
    }

    // RCG-009: pass the plan's benchmark comparison through to any SQL
    // template that declares "benchmark"/"comparison"-named parameters.
    // The benchmark string stays exactly the opaque canonical id
    // Universal Core produced - only this Healthcare-owned code (and
    // the SQL template it flows into) ever interprets it.
    if (executionPlan.benchmark) {
      parameters.benchmark = executionPlan.benchmark.benchmark;
      parameters.comparison = executionPlan.benchmark.comparison;
    }

    // Merge with any additional parameters from ExecutionPlan
    if (executionPlan.parameters) {
      Object.assign(parameters, executionPlan.parameters);
    }

    return this.parameterResolver.resolve(parameters);
  }

  /**
   * Phase 7: select the template used to fetch a secondary metric's
   * values for the exact facility_id set already selected by the
   * primary metric's query.
   *
   * Tier1 Task 3: when Universal Core's own primary-metric choice was
   * "hospital-detail" (see the same case handled at the top of
   * selectTemplateFromPlan()) but that primary execution was redirected
   * to this analytical metric's own single-hospital template, this
   * "secondary" slot - still nominally the analytical metric, from
   * Universal Core's own, unchanged point of view - is swapped to fetch
   * hospital-detail's own profile fields instead of re-running the
   * generic, unscoped "byIds" aggregate for the same metric a second
   * time. The merged result carries both the correctly-scoped
   * condition-specific primary row AND the hospital's identity/profile
   * fields the user's "tell me about" phrasing asked for.
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

      // Tier1 Task 3: a list/scope-shaped redirect target (e.g.
      // "hospital-list", from "Tell me about hospitals in Texas") has no
      // "-by-facility-ids" companion template of its own, and its own
      // primary result (now correctly selected above) already carries
      // every column it would otherwise contribute. Reuses the existing,
      // harmless, already-registered "hospital-overall-rating-by-
      // facility-ids" template (a strict subset of columns the primary
      // result already has) rather than fail on an unregistered
      // "hospital-list-by-facility-ids" id.
      return "hospital-overall-rating-by-facility-ids";
    }

    return this.templateSelector.select(metric.metric, "byIds");
  }

  /**
   * Phase 7: resolve parameters for a secondary metric fetch. The
   * identity values are the exact facility_ids the primary query
   * already returned - no independent ranking or limiting happens here.
   */
  resolveSecondaryMetricParameters(
    metric: ExecutionPlanMetric,
    executionPlan: ExecutionPlan,
    identityValues: readonly unknown[],
  ): Record<string, unknown> {
    // Tier1 Task 3: mirrors selectSecondaryMetricTemplate()'s own swap -
    // hospital-detail's template takes a single `hospitalId`, not the
    // array-shaped `facilityIds` every other secondary-metric template
    // expects. Safe because this swap only ever fires when exactly one
    // hospital was resolved (see the "=" hospital filter check above),
    // so `identityValues` always carries exactly one value here.
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

  /**
   * Tier1 Task 6 + LLM Integration Layer 2: delegates to the
   * Domain-owned generator - see suggestion-generator.ts for the
   * deterministic depth/breadth/entity-dive/recovery rules themselves,
   * and generateHealthcareSuggestionsWithLLMRephrasing's own doc comment
   * for how an optional, bounded LLM co-pilot call fits in without ever
   * changing which facts a suggestion can mention.
   */
  async generateSuggestions(context: SuggestionContext): Promise<string[]> {
    return generateHealthcareSuggestionsWithLLMRephrasing(context);
  }
}