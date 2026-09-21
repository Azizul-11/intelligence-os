import type { QueryIntent } from "@intelligence/query-planner";
import type { RuntimeResult } from "./runtime-result";

export interface RuntimeRequest {
  question: string;
  parameters?: Record<string, unknown>;

  /**
   * Batch 5A-1: called once with the final result of the execution that answers this request (a rewrite's recursive
   * run included), before the suggestions are generated. It lets the caller start work on the rows (the summary)
   * while the suggestions are still being produced instead of after them. Purely observational: nothing about the
   * result changes because a callback is set. Never inherited by a suggestion's dry run.
   */
  onResult?: (result: RuntimeResult) => void;

  /**
   * Tier0 Task 2 (F8) Phase 2: caller-supplied request identifier, used to
   * correlate this execution's PhaseGateTracker trace with the request
   * that produced it (e.g. the orchestrator's per-HTTP-request UUID).
   * Optional - when omitted, create-runtime-engine.ts generates one so a
   * trace always exists.
   */
  requestId?: string;

  /**
   * Tier0 Task 2 (F8) frontend fix: set by Layer 2 continuation
   * (Phase 8.10) when reconstructing Turn 2 of an identity-disambiguation
   * clarification (e.g. "best hospital for Northwest Medical Center" ->
   * "WINFIELD" resolved which Northwest Medical Center). Pending
   * interactions are bounded two-turn only (see PendingInteraction's own
   * doc comment) - Turn 2 must terminate, not chain into a further
   * clarification about the SAME already-resolved identity. Skips
   * `DomainExecutionStrategy.checkPlanAmbiguity` entirely for this
   * execution; every other gate (metric resolution, template selection,
   * parameter compatibility) still runs normally, so a Turn 2 for a
   * mortality-rate (or any other metric) query still looks up the right
   * metric, not a hardcoded one.
   */
  identityAlreadyResolved?: boolean;

  /**
   * Tier0 Task 6: structural identity injection for a Layer 2
   * continuation Turn 2. When a Turn 1 identity clarification already
   * pinned down exactly which candidate the user meant (see
   * PendingInteraction.offeredOptions), the reconstructed Turn 2
   * question is not guaranteed to re-resolve that same identity from
   * text alone (e.g. an appended location qualifier not adjacent enough
   * to the entity mention to narrow it under EntityProvider's
   * contiguity rule) - it can re-trigger the identical ambiguity Turn 1
   * already resolved. `value` is the already-known candidate's own
   * opaque value (the same value Turn 1's ambiguity offered, e.g. a
   * facility id) - matched generically (by value, never by name or
   * domain vocabulary) against every current identityAmbiguities entry
   * still present after re-resolving this Turn 2 question; only ever
   * resolves an ambiguity that still exists, never overrides an entity
   * that already resolved (successfully or not) through the ordinary
   * text pipeline.
   */
  forcedIdentityCandidate?: { value: unknown };

  /**
   * Tier0 Task 6 (F8 own-choice extension): when a Layer 2 continuation
   * re-executes an already-disambiguated single-entity choice (e.g. the
   * pre-existing Task 2 F8 "own rating" branch of a hospital-ranking
   * ambiguity - "Mayo Clinic best AMI mortality" -> "own"), the original
   * question's ranking modifier ("best") is no longer meaningful once a
   * single record is already pinned down: re-planning it as a "ranking"
   * would route to a population-wide template with no parameter for the
   * one already-known record, discarding it. Forces `QueryPlanner`'s
   * intent past keyword detection - the exact same lever
   * `discoveredComparableMetrics`/`discoveredDefaultRanking` already use
   * internally for their own non-keyword-reliable cases. Domain-agnostic
   * (a fixed Universal `QueryIntent`, never a domain-specific value).
   */
  forcedIntent?: QueryIntent;

  /**
   * Comparison continuation fix: when a Layer 2 continuation resolves one
   * ambiguous entity in a multi-entity comparison query (e.g., "compare
   * memorial hospital vs ANIMAS" -> "CARTHAGE"), Turn 2 must preserve the
   * companion entities (non-ambiguous entities from Turn 1) so
   * ExecutionPlanMapper constructs a multi-entity IN filter. Each entry
   * contains the already-resolved value and canonicalKey from Turn 1.
   * Only injected when Turn 1 had 2+ entities (comparison). Single-entity
   * clarifications leave this undefined (no companion entities to preserve).
   */
  companionEntities?: Array<{ value: unknown; canonicalKey: string }>;

  /**
   * Tier1 Task 6: opt-in (default false/omitted - no behavior change for
   * any existing caller) request for 2-3 dry-run-validated follow-up/
   * recovery suggestions on the response (see RuntimeResult.suggestions).
   * Set by the two real production entry points (orchestrator's Turn 1
   * and Turn 2 continuation execute() calls) - never by
   * create-runtime-engine.ts's own recursive dry-run validation of a
   * candidate suggestion, which deliberately omits this flag so a
   * candidate never spawns suggestions of its own. Deliberately opt-in
   * rather than opt-out: dozens of pre-existing verification scripts
   * construct a RuntimeEngine directly (often with a spy executor) to
   * assert an exact SQL-call count for one specific request - an
   * opt-out default would have silently added extra dry-run SQL calls
   * to every one of them.
   */
  includeSuggestions?: boolean;

  /**
   * Tier1 Task 6 regression fix (production-latency hardening): internal
   * only - set exclusively by create-runtime-engine.ts's own suggestion
   * dry-run validation, never by an external caller. When true, every
   * gate up through filter-compatibility still runs for real (semantic
   * resolution, planning, template/capability selection), but the
   * request returns immediately BEFORE the actual SQL execution gate
   * (`deterministic-warehouse-execution`) with a synthetic successful
   * result - proving a candidate question "would be answerable" without
   * a live warehouse round-trip. Per the platform's High Performance
   * Invariant: never run a real, recursive SQL query on the production
   * execution path just to validate a suggestion.
   */
  dryRun?: boolean;

  /**
   * LLM Integration Layer 1: internal recursion guard only - set by
   * create-runtime-engine.ts's own delegation to a fresh recursive
   * execute() call after an LLM-rewritten canonical question, never by
   * an external caller. Prevents a rewrite that itself still fails to
   * resolve from attempting a second rewrite (bounded to exactly one
   * LLM rewrite attempt per original user question).
   */
  llmFallbackAttempted?: boolean;

  /**
   * Batch 1 (Step 1.2): internal only, set by create-runtime-engine.ts's
   * own recursive execute() that runs an LLM-rewritten canonical question -
   * the user's ORIGINAL question. Lets the unaccounted-word gate tell a word
   * the user typed (and the rewrite kept, unresolved) from a word the
   * rewrite introduced itself.
   */
  rewrittenFrom?: string;
}