import type { QueryIntent } from "@intelligence/query-planner";
import type { RuntimeResult } from "./runtime-result";

export interface RuntimeRequest {
  question: string;
  parameters?: Record<string, unknown>;

  /** Batch 5A-1: called once with the final result of the answering execution (rewrite recursion included), before suggestions are generated, so the caller can start the summary early. Purely observational; never inherited by a suggestion's dry run. */
  onResult?: (result: RuntimeResult) => void;

  /** Tier0 Task 2 (F8) Phase 2: caller-supplied id to correlate the PhaseGateTracker trace with its request; create-runtime-engine.ts generates one if omitted. */
  requestId?: string;

  /** Tier0 Task 2 (F8): set by Layer 2 continuation (Phase 8.10) on Turn 2 of an identity clarification; pending interactions are two-turn only, so Turn 2 must not chain into another clarification about the same identity.
   * Skips `DomainExecutionStrategy.checkPlanAmbiguity` only; every other gate (metric resolution, template selection, parameter compatibility) still runs. */
  identityAlreadyResolved?: boolean;

  /** Tier0 Task 6: structural identity injection for a continuation Turn 2, since the reconstructed question may not re-resolve the identity Turn 1 pinned (EntityProvider contiguity rule) and could re-trigger the same ambiguity.
   * `value` is the chosen candidate's opaque value (e.g. a facility id), matched generically by value against current identityAmbiguities; only resolves a still-existing ambiguity, never overrides an entity the text pipeline already resolved. */
  forcedIdentityCandidate?: { value: unknown };

  /** Tier0 Task 6 (F8 own-choice): forces `QueryPlanner`'s intent past keyword detection when a continuation re-executes an already-pinned single entity (e.g. "Mayo Clinic best AMI mortality" -> "own");
   * a "best" ranking intent would route to a population-wide template with no parameter for the known record. Same lever as `discoveredComparableMetrics`/`discoveredDefaultRanking`; a fixed Universal `QueryIntent`. */
  forcedIntent?: QueryIntent;

  /** Comparison continuation fix: on Turn 2 of a multi-entity comparison, preserves the non-ambiguous companion entities from Turn 1 (value + canonicalKey) so ExecutionPlanMapper builds a multi-entity IN filter; undefined for single-entity clarifications. */
  companionEntities?: Array<{ value: unknown; canonicalKey: string }>;

  /** Tier1 Task 6: opt-in (default off) request for 2-3 dry-run-validated suggestions (RuntimeResult.suggestions), set by the orchestrator's Turn 1 and Turn 2 execute() calls; the engine's own recursive dry run omits it so candidates never spawn suggestions.
   * Opt-in because many verification scripts assert exact SQL-call counts on a directly built RuntimeEngine; an opt-out default would add dry-run SQL calls to all of them. */
  includeSuggestions?: boolean;

  /** Tier1 Task 6 regression fix: internal only, set by create-runtime-engine.ts's suggestion dry run. Every gate through filter-compatibility runs, then it returns a synthetic success BEFORE `deterministic-warehouse-execution`,
   * proving answerability without a live warehouse round-trip (High Performance Invariant: no recursive real SQL on the production path just to validate a suggestion). */
  dryRun?: boolean;

  /** LLM Integration Layer 1: internal recursion guard set by create-runtime-engine.ts on its recursive execute() after an LLM rewrite; bounds rewriting to one attempt per original question. */
  llmFallbackAttempted?: boolean;

  /** Batch 1 (Step 1.2): internal only; the user's ORIGINAL question on the recursive run of a rewritten question, so the unaccounted-word gate can tell user-typed words from rewrite-introduced ones. */
  rewrittenFrom?: string;

  /** V4 fix plan (Batch 4): internal recursion guard set by create-runtime-engine.ts when restoring a qualifier the rewrite dropped (`domain.preservedEntityParameters`); one attempt per question, like `llmFallbackAttempted`. */
  qualifierRestoreAttempted?: boolean;
}