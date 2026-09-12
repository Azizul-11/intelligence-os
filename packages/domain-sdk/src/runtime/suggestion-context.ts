import type { ExecutionPlan } from "@intelligence/contracts";
import type { AnswerabilityResult } from "@intelligence/contracts";

/**
 * Tier1 Task 6: generic, domain-agnostic context Universal Core already
 * has in hand once a request finishes (success or failure) - passed to a
 * Domain SDK's own optional `DomainExecutionStrategy.generateSuggestions`
 * hook so it can build follow-up/recovery suggestion candidates.
 * Universal Core assembles this generically and never inspects `rows`'
 * column names or interprets `executionPlan`'s metric/filter ids - only
 * a Domain SDK does.
 */
export interface SuggestionContext {
  /** The original question text this request answered or refused. */
  question: string;

  success: boolean;

  rowCount?: number;

  /** Opaque result rows, when the request succeeded. */
  rows?: readonly Record<string, unknown>[];

  /** The plan Universal Core built for this request, when it got that far. */
  executionPlan?: ExecutionPlan;

  answerability?: AnswerabilityResult;
}
