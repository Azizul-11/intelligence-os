import type {
  DomainExecutionStrategy,
} from "@intelligence/domain-sdk";
import type { ExecutionPlan, ExecutionPlanMetric } from "@intelligence/contracts";

import { HealthcareTemplateSelector } from "./template-selector";
import { HealthcareParameterResolver } from "./parameter-resolver";

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
   * Phase 5.3: Select template using ExecutionPlan.
   */
  selectTemplateFromPlan(executionPlan: ExecutionPlan): string {
    // Phase 7.5.5: when the request names an explicit set of hospitals
    // (more than one distinct resolved facility_id under the "hospital"
    // execution parameter, carried as Phase 7.5.3's "in" filter), the
    // request is always answered by fetching exactly those facilities -
    // the same deterministic "by-facility-ids" capability Phase 7
    // already established for secondary-metric enrichment - regardless
    // of surface intent wording ("compare", "list", etc.). A single
    // resolved hospital, or no hospital at all, falls through to the
    // existing intent-based selection below, unchanged.
    const explicitHospitalSet = executionPlan.filters.some(
      (filter) => filter.field === "hospital" && filter.operator === "in",
    );

    if (explicitHospitalSet) {
      return this.templateSelector.select(executionPlan.metric, "byIds");
    }

    const hasStateFilter = executionPlan.filters.some(
      (filter) => filter.field === "state",
    );

    // RCG-008: grouped ranking. Universal Core only ever supplies an
    // opaque dimension canonical key on ExecutionPlan.grouping -
    // Healthcare owns the mapping from that key to its own grouped SQL
    // templates and column names (see HealthcareTemplateSelector).
    if (executionPlan.grouping && executionPlan.grouping.dimensions.length > 0) {
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
   */
  selectSecondaryMetricTemplate(
    metric: ExecutionPlanMetric,
    _executionPlan: ExecutionPlan,
  ): string {
    return this.templateSelector.select(metric.metric, "byIds");
  }

  /**
   * Phase 7: resolve parameters for a secondary metric fetch. The
   * identity values are the exact facility_ids the primary query
   * already returned - no independent ranking or limiting happens here.
   */
  resolveSecondaryMetricParameters(
    _metric: ExecutionPlanMetric,
    _executionPlan: ExecutionPlan,
    identityValues: readonly unknown[],
  ): Record<string, unknown> {
    return {
      facilityIds: identityValues,
    };
  }
}