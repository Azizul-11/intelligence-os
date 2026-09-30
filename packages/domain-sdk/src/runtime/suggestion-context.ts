import type { ExecutionPlan } from "@intelligence/contracts";
import type { AnswerabilityResult } from "@intelligence/contracts";

/** Context passed to a Domain SDK's optional generateSuggestions hook after a request finishes. Universal Core never interprets its contents. */
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
