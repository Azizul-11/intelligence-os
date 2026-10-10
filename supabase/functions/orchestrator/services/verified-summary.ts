import { supabase } from "../../shared/supabase.ts";
import { findUngroundedNames, mentionsIdentifier } from "./summary-grounding.ts";
import { getDomainCapabilities, prepareSummaryContext } from "./domain-registry.ts";
import { llmGateway } from "@intelligence/llm-model-gateway";

/** Relocated from handlers/chat.ts (2026-09-27) so continuation.ts can call it without a circular import; behavior unchanged.
 * The summary is decoration (the rows are the answer): free-chain calls took 10-44 s when rate-limited (live, 2026-09-19), so the call has a hard budget and a late summary is left out. */
const SUMMARY_DEADLINE_MS = 3500;

/** Phase 3.5: the summary is written from the domain's prepared context and passes the same guards (no code/column name, every number in the rows or facts, every name grounded).
 * A rejected summary is not shown; its text and reason are kept (response metadata, persisted trace). */
export interface VerifiedSummary {
  summary?: string;
  rejected?: { reason: string; text: string };
}

function extractNumericTokens(text: string): string[] {
  return text.match(/\d+(\.\d+)?/g) ?? [];
}

function rowsContainNumber(rows: Record<string, unknown>[], token: string): boolean {
  return rows.some((row) =>
    Object.values(row).some((value) => String(value).includes(token)),
  );
}

export async function buildVerifiedSummary(
  question: string,
  rows: Record<string, unknown>[],
  parameters: Record<string, unknown> | undefined,
  alreadyShown: readonly string[],
  focus?: Record<string, string | undefined>,
): Promise<VerifiedSummary> {
  if (rows.length === 0) {
    return {};
  }

  const prepared = prepareSummaryContext(rows, parameters, alreadyShown, focus);
  const summary = await llmGateway.summarizeResult(question, prepared.context.rows, SUMMARY_DEADLINE_MS, getDomainCapabilities().prompts, {
    kind: prepared.context.kind,
    ...(prepared.context.measure ? { measure: prepared.context.measure } : {}),
    filters: prepared.context.filters,
    scope: prepared.context.scope,
    facts: prepared.context.facts,
    alreadyShown: prepared.context.alreadyShown,
  });
  if (!summary) {
    return {};
  }

  const reject = (reason: string, detail?: unknown): VerifiedSummary => {
    console.warn(`[Summary dropped: ${reason}]`, detail ?? "", summary.slice(0, 600));
    return { rejected: { reason, text: summary.slice(0, 600) } };
  };

  if (mentionsIdentifier(summary)) {
    return reject("a column name or code in the text");
  }

  const allowedNumbers = new Set(prepared.factNumbers);
  const unverified = extractNumericTokens(summary).filter(
    (token) => !allowedNumbers.has(token) && !rowsContainNumber(rows, token) && !rowsContainNumber(prepared.context.rows, token),
  );
  if (unverified.length > 0) {
    return reject("a number that is not in the rows or the facts", unverified);
  }

  // The number check cannot see a hospital that is not in the table (live:
  // "New England Medical Center", "AdventHealth Orlando" passed it).
  const catalog = getDomainCapabilities();
  const ungrounded = findUngroundedNames(summary, question, rows, [
    ...catalog.states,
    ...catalog.ownerships,
    ...catalog.metrics.map((metric) => metric.displayName),
    ...(catalog.concepts ?? []).map((concept) => concept.displayName),
    ...prepared.vocabulary,
  ]);
  if (ungrounded.length > 0) {
    return reject("a name that is not in the rows", ungrounded);
  }

  return { summary };
}

/** Phase 3.5: the rejected summary is appended to this request's persisted trace (best effort, never blocks the answer). */
export async function recordRejectedSummary(requestId: string, trace: unknown, rejected: { reason: string; text: string }): Promise<void> {
  try {
    await supabase
      .from("phase_execution_trace")
      .update({ gates: [...((trace as unknown[] | undefined) ?? []), { phase: "summary-grounding", status: "rejected", sqlCalls: 0, detail: rejected }] })
      .eq("request_id", requestId);
  } catch (error) {
    console.error("[Rejected summary trace failed]", error);
  }
}
