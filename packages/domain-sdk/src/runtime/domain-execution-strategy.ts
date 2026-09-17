import type { ExecutionPlan, ExecutionPlanMetric } from "@intelligence/contracts";
import type { EntityResolutionResult } from "./entity-resolution-result";
import type { SuggestionContext } from "./suggestion-context";

export interface DomainExecutionStrategy {
  selectTemplate(
    metricId: string,
    intent: string,
  ): string;

  /**
   * Pre-Phase 9 Tier0: report a plan-level ambiguity a Domain SDK can only
   * detect once every filter in the ExecutionPlan is known - e.g. a
   * geographic scope filter (county/city) whose value exists in more than
   * one state, with no state filter present to disambiguate it. Returning
   * a non-empty array here is Universal Core's cue to refuse the request
   * with the same Phase 8.3 `ambiguous`/`identity-ambiguous` clarification
   * gate already used for entity-identity ambiguity, reusing the exact
   * same `EntityResolutionResult`/`AmbiguousCandidate` shape - never a
   * synthetic/unregistered template id, and never a raw "not found" error.
   *
   * Optional and additive: a Domain SDK that has no such plan-level
   * ambiguity to report (or hasn't implemented this yet) simply omits it;
   * Universal Core skips the check entirely when undefined.
   */
  checkPlanAmbiguity?(
    executionPlan: ExecutionPlan,
  ): EntityResolutionResult[] | undefined;

  resolveParameters(
    entities: Record<string, unknown>,
  ): Record<string, unknown>;

  /**
   * Phase 5.3: Select template using ExecutionPlan.
   *
   * Provides execution-focused structure for capability resolution.
   * Falls back to selectTemplate if not implemented.
   */
  selectTemplateFromPlan?(
    executionPlan: ExecutionPlan,
  ): string;

  /**
   * Phase 5.3: Resolve parameters using ExecutionPlan.
   *
   * Converts ExecutionPlan filters to execution parameters.
   * Falls back to resolveParameters if not implemented.
   */
  resolveParametersFromPlan?(
    executionPlan: ExecutionPlan,
  ): Record<string, unknown>;

  /**
   * Phase 7: the column name that uniquely identifies a result row for
   * this domain (e.g. Healthcare declares "facility_id").
   *
   * Optional - a domain that does not declare this cannot participate in
   * multi-metric row-joining; Universal Core never assumes or hardcodes
   * a column name of its own.
   */
  resultIdentityField?: string;

  /**
   * Phase 7: select the template used to fetch a SECONDARY metric's
   * values for an already-determined set of result-identity values
   * (e.g. the identity values already selected by the primary metric's
   * query).
   *
   * Optional - domains that don't implement this simply get
   * single-metric behavior even for a multi-metric plan.
   */
  selectSecondaryMetricTemplate?(
    metric: ExecutionPlanMetric,
    executionPlan: ExecutionPlan,
  ): string;

  /**
   * Phase 7: resolve parameters for a secondary metric fetch, given the
   * already-executed primary result's identity values.
   */
  resolveSecondaryMetricParameters?(
    metric: ExecutionPlanMetric,
    executionPlan: ExecutionPlan,
    identityValues: readonly unknown[],
  ): Record<string, unknown>;

  /**
   * Tier1 Task 6: optional, Domain-owned generator of candidate
   * follow-up (success) or recovery (failure) question strings for the
   * request that just completed - see SuggestionContext. Return more
   * than the 2-3 that will ultimately be surfaced; Universal Core
   * dry-run validates each candidate in order (re-executes it end-to-end
   * and keeps only those that succeed with rows) before ever surfacing
   * one, and never inspects candidate text itself. A domain that omits
   * this hook simply gets no `suggestions` field on its responses.
   *
   * LLM Integration Layer 2: async (not just Promise-compatible - Domain
   * SDKs are expected to actually await an optional LLM rephrasing call
   * here) so a Domain can optionally vary the wording of its own
   * already-decided candidates via an LLM co-pilot before Universal
   * Core's dry-run validation runs - Universal Core itself never knows
   * or cares whether a candidate came from a deterministic rule or an
   * LLM rephrase.
   */
  generateSuggestions?(context: SuggestionContext): Promise<string[]>;
}