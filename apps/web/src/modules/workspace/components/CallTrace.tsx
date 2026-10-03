import { Check, Minus, Pause, Timer } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import type { ChatResponse, LlmCall, PhaseGateTraceEntry } from "../api/orchestrator";

/**
 * Tier0 Task 2 (F8) Phase 2: the same 7 gates
 * packages/runtime-engine/src/phase-gate-tracker.ts declares, mirrored
 * here only as display labels/order - this component never decides
 * anything from these, it only renders whatever `trace` the backend
 * response already carries for that exact request.
 */
const GATE_LABELS: Record<string, string> = {
  "semantic-candidate-resolution": "Semantic Extraction",
  "entity-identity-ambiguity": "Entity Resolution",
  "execution-plan-building": "Plan Building",
  "plan-ambiguity-check": "Ambiguity Check",
  "capability-template-availability": "Capability Check",
  "parameter-filter-compatibility": "Filter Compatibility",
  "deterministic-warehouse-execution": "Execution",
};
const GATE_ORDER = Object.keys(GATE_LABELS);

/**
 * Phase 3.6 (LLM-First Front Door): a conditional, optional phase - only
 * present in `trace` when Layer 0.5 actually ran for this exact request
 * (it is deliberately skipped for the fast-path/continuation/flag-
 * disabled cases - by design, not a failure). Unlike the 7 mandatory
 * GATE_ORDER gates above, this is never added to the "not reached" list
 * when absent, and - since it genuinely runs BEFORE semantic extraction,
 * not after execution - is always rendered first when present, rather
 * than falling into the generic "unknown trailing phase" bucket.
 */
const LLM_PHASE = "llm-normalization";
const LLM_PHASE_LABEL = "LLM Normalization";
const LLM_PHASE_SUCCESS_STATUSES = new Set(["rewritten", "unchanged"]);
/**
 * Tier0 Task 2 (F8) Phase 2: renders the ordered gate trace this exact
 * response carried, proving live (per response, not as a general claim)
 * which of the 7 gates this specific query actually visited before
 * stopping - a query refused at gate 4 shows gates 5-7 as never reached,
 * which is the correct, expected shape for a refusal, not a rendering
 * bug. A gate present in `trace` under a name this component doesn't
 * recognize (e.g. a future gate) still renders, generically, rather than
 * being silently dropped - this view must never hide evidence.
 */
export function PhasePipeline({ trace }: { trace: PhaseGateTraceEntry[] }) {
  const lastByPhase = new Map<string, PhaseGateTraceEntry>();
  const seenOrder: string[] = [];

  for (const entry of trace) {
    if (!lastByPhase.has(entry.phase)) {
      seenOrder.push(entry.phase);
    }
    lastByPhase.set(entry.phase, entry);
  }

  const orderedPhases = [
    ...(seenOrder.includes(LLM_PHASE) ? [LLM_PHASE] : []),
    ...GATE_ORDER.filter((phase) => seenOrder.includes(phase)),
    ...seenOrder.filter((phase) => phase !== LLM_PHASE && !GATE_ORDER.includes(phase)),
  ];
  const unreached = GATE_ORDER.filter((phase) => !seenOrder.includes(phase));

  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs">
      {orderedPhases.map((phase) => {
        const last = lastByPhase.get(phase)!;
        const stopped =
          phase === LLM_PHASE
            ? !LLM_PHASE_SUCCESS_STATUSES.has(last.status) && last.status !== "ok"
            : last.status !== "enter" && last.status !== "ok";
        const label = phase === LLM_PHASE ? LLM_PHASE_LABEL : (GATE_LABELS[phase] ?? phase);
        return (
          <span
            key={phase}
            title={`${phase}: ${last.status}${last.answerability ? ` (${last.answerability})` : ""}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium",
              stopped ? "bg-primary/15 text-primary" : "bg-success/15 text-success",
            )}
          >
            {stopped ? <Pause className="size-3" aria-hidden="true" /> : <Check className="size-3" aria-hidden="true" />}
            {label}
          </span>
        );
      })}
      {unreached.map((phase) => (
        <span
          key={phase}
          title={`${phase}: not reached`}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground"
        >
          <Minus className="size-3" aria-hidden="true" />
          {GATE_LABELS[phase]}
        </span>
      ))}
    </div>
  );
}

const LLM_ROLES: LlmCall["role"][] = ["normalizer", "summary", "suggestions"];

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function describeCall(call: LlmCall, summaryShown: boolean, rejectedReason?: string): string {
  const tiers = call.tiers.replaceAll(">", " → ");
  if (call.provider === "none") {
    return `failed or timed out after ${fmtMs(call.latencyMs)}${tiers ? ` (tried ${tiers})` : ""}`;
  }
  return [
    `${call.model} · ${call.provider} · ${fmtMs(call.latencyMs)}`,
    call.fallbackUsed ? `fallback, tried ${tiers}` : "",
    call.role === "summary" && rejectedReason ? `answered but not shown (${rejectedReason})` : "",
    call.role === "summary" && !rejectedReason && !summaryShown ? "answered but not shown (a number or name in it is not in the rows)" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Where the time went for this exact response and which LLM (if any) served
 * each role. Everything is read from what the backend returned - `llmCalls`
 * (one entry per gateway call; a role with no entry was not called),
 * `metadata.executionTimeMs` (server total) and the gate timestamps (the
 * warehouse query runs from the execution gate to the response gate). The only
 * value measured here is the browser round trip.
 */
export function CallTrace({ result, clientMs }: { result: ChatResponse; clientMs?: number | undefined }) {
  const calls = result.llmCalls ?? [];
  const trace = result.trace ?? [];
  const execution = trace.find((gate) => gate.phase === "deterministic-warehouse-execution");
  const response = trace.find((gate) => gate.phase === "response");
  const timings = [
    clientMs !== undefined ? `browser ${fmtMs(clientMs)}` : "",
    result.metadata?.executionTimeMs !== undefined ? `server ${fmtMs(result.metadata.executionTimeMs)}` : "",
    execution && response ? `warehouse query ${fmtMs(response.timestamp - execution.timestamp)}` : "",
  ].filter(Boolean);
  const roles = calls.some((call) => call.role === "conversational") ? [...LLM_ROLES, "conversational" as const] : LLM_ROLES;

  return (
    <div className="mb-2 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
      {timings.length > 0 && (
        <p className="flex items-center gap-1.5">
          <Timer className="size-3.5" aria-hidden="true" />
          {timings.join(" · ")}
        </p>
      )}
      <ul>
        {roles.map((role) => {
          const roleCalls = calls.filter((call) => call.role === role);
          return (
            <li key={role}>
              <span className="font-medium text-foreground">{role}</span>:{" "}
              {roleCalls.length === 0
                ? "not called"
                : roleCalls.map((call) => describeCall(call, !!result.summary, result.metadata?.summaryRejected?.reason)).join("; ")}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
