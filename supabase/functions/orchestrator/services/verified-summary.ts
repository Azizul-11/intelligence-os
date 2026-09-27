import { supabase } from "../../shared/supabase.ts";
import { findUngroundedNames, mentionsIdentifier } from "./summary-grounding.ts";
import { getDomainCapabilities, prepareSummaryContext } from "./domain-registry.ts";
import { llmGateway } from "@intelligence/llm-model-gateway";

/**
 * Relocated from handlers/chat.ts (2026-09-27, post-clarification summary fix) so services/continuation.ts can call
 * it too without a circular import (chat.ts already imports continuation.ts). Behavior is unchanged from the
 * original chat.ts code - this is a pure move, not a rewrite.
 *
 * The summary is decoration: the rows are already the answer. On the free chain it took 10-44 s whenever the first
 * tiers were rate-limited (live, 2026-09-19), so the whole call gets a hard budget and a late summary is simply left
 * out - the same outcome as one the numeric cross-check rejects.
 */
const SUMMARY_DEADLINE_MS = 3500;

/**
 * Phase 3.5: the summary is written from a prepared context (what the rows measure, the filters applied, precomputed
 * facts, plain-labelled rows - the domain builds it) and still passes the same guards: no code or column name, every
 * number present in the rows or in the context's facts, every name grounded. A rejected summary is not shown, and its
 * text and reason are kept (response metadata and the persisted trace) so a drop can be read instead of guessed.
 */
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
): Promise<VerifiedSummary> {
  if (rows.length === 0) {
    return {};
  }

  const prepared = prepareSummaryContext(rows, parameters, alreadyShown);
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
