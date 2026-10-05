import type { PlanCompletenessReport } from "@intelligence/query-planner";
import type { AnswerabilityResult } from "@intelligence/semantic";
import type { CoverageFact } from "./coverage-fact";
import type { PhaseGateEntry } from "./phase-gate-tracker";

export interface RuntimeResult<T = unknown> {
  success: boolean;

  rows: T[];

  rowCount: number;

  error?: string;

  /** Pre-Phase 8 semantic-completeness check: whether every resolved candidate was accounted for in the ExecutionPlan; diagnostic, only on a successful execution with a plan built, not yet consumed (reserved for Phase 8 answerability). */
  completeness?: PlanCompletenessReport;

  /** Phase 8.1: structured classification of whether the request could proceed to deterministic execution; present on every response, generalizes four ad hoc gates plus identity ambiguity. Additive: success/failure and error text are unchanged. */
  answerability?: AnswerabilityResult;

  /** Phase 8.6C: evidentiary, policy-neutral coverage facts, one per metric whose template declared `coverageTemplateId` (SqlTemplateDefinition); only on a successful "rank"/"aggregate" where a template opted in.
   * Additive and diagnostic: carries no interpretation (policy, threshold, disclosure text), which is a later answerability/guidance decision. */
  coverage?: CoverageFact[];

  /** Batch 5A-1: parameters the answering template ran with (resolved filters etc.), only on success, so a Domain can describe its result exactly (e.g. ties for the top value IN THIS SCOPE). Diagnostic and additive. */
  executedParameters?: Record<string, unknown>;

  /** Tier0 Task 2 (F8) Phase 2: ordered gate trace PhaseGateTracker recorded for this execution; present on every response, diagnostic and additive. */
  trace?: PhaseGateEntry[];

  /** Tier0 Task 6: only on an identity-ambiguous refusal - the semantic candidates (never the ambiguous entity) resolved before that gate refused; opaque `unknown[]` (no `@intelligence/semantic` import, to avoid circular dependencies).
   * Lets a Layer 2 Turn 1 pending-interaction carry real context into `originalSemanticResult` instead of an empty placeholder; carry-forward only. */
  semanticMatches?: unknown[];

  /** Tier1 Task 6: 2-3 clickable follow-up question texts, on success and failure paths (empty array = nothing to suggest); populated whenever a Domain SDK implements `DomainExecutionStrategy.generateSuggestions`. Rule-based now, may be LLM later: callers must not assume which.
   * Each has been dry-run validated by create-runtime-engine.ts (`success && rowCount > 0`) before being surfaced. */
  suggestions?: string[];

  /** ConversationalFix (2026-09-27): only when `answerability.status === "conversational"` - the optional `conversationalCheck` hook (CreateRuntimeEngineOptions) judged the question small talk or a capability question, before the paid normalizer ran.
   * `rows` stays empty (0 SQL); the caller renders this text directly and Core never inspects it. */
  conversationalAnswer?: string;
}