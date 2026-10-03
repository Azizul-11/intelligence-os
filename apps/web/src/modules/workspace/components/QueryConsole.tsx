import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp, Check, CornerDownRight, Lightbulb, MapPin, Minus, Pause, Timer } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ThinkingOrb } from "thinking-orbs";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

import {
  askOrchestrator,
  type ChatResponse,
  type LlmCall,
  type PhaseGateTraceEntry,
} from "../api/orchestrator";
import { type ChatEntry, useChatHistory } from "../stores/chat-history.store";
import { activeDomain } from "@/domains";

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


function pickRandomPrompts(pool: readonly string[], count: number): string[] {
  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled.slice(0, count);
}

type SubmitVariables = {
  conversationId: string;
  q: string;
  pendingId?: string;
  contResp?: string;
  startedAt: number;
};

export function QueryConsole() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  const conversation = useChatHistory((state) => (conversationId ? state.conversations[conversationId] : undefined));
  const startConversation = useChatHistory((state) => state.startConversation);
  const appendEntry = useChatHistory((state) => state.appendEntry);

  const [question, setQuestion] = useState("");
  // A fresh random 8 for each new chat, so starting over never shows the same prompts.
  const examplePrompts = useMemo(() => pickRandomPrompts(activeDomain.chat.examplePrompts, 8), [conversationId]);

  const history = conversation?.entries ?? [];
  const activePendingInteraction = conversation?.pendingInteraction ?? null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Saved from the mutation's own options, not per-call callbacks, so a reply still lands in its chat if the user navigates away first.
  const mutation = useMutation({
    mutationFn: ({ q, pendingId, contResp }: SubmitVariables) => askOrchestrator(q, activeDomain.id, pendingId, contResp),
    onSuccess: (result, vars) => {
      appendEntry(
        vars.conversationId,
        {
          id: crypto.randomUUID(),
          question: vars.q,
          result,
          clientMs: Math.round(performance.now() - vars.startedAt),
          pendingInteractionId: result.pendingInteractionId,
          interactionKind: result.interactionKind,
        },
        // Phase 8.10 Layer 2: Preserve pending interaction for Turn 2; a normal answer clears it.
        result.pendingInteractionId && result.interactionKind
          ? { id: result.pendingInteractionId, kind: result.interactionKind }
          : null,
      );
    },
    onError: (error, vars) => {
      appendEntry(
        vars.conversationId,
        {
          id: crypto.randomUUID(),
          question: vars.q,
          result: {
            success: false,
            answer: "",
            error: error instanceof Error ? error.message : "Request failed.",
          },
          clientMs: Math.round(performance.now() - vars.startedAt),
        },
        null,
      );
    },
  });

  const isPendingHere = mutation.isPending && mutation.variables?.conversationId === conversationId;

  // Modern chat convention: newest message stays in view, scrolled to automatically.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, isPendingHere]);

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed || mutation.isPending) return;

    const targetId = conversation?.id ?? crypto.randomUUID();
    if (!conversation) {
      startConversation(targetId, trimmed);
      navigate(`/chat/${targetId}`);
    }

    // Phase 8.10 Layer 2: Capture current pending state before mutation
    const currentPendingId = activePendingInteraction?.id;
    const isContinuation = activePendingInteraction !== null;

    mutation.mutate({
      conversationId: targetId,
      q: trimmed,
      pendingId: currentPendingId,
      contResp: isContinuation ? trimmed : undefined,
      startedAt: performance.now(),
    });

    setQuestion("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-6">
          {history.length === 0 && !isPendingHere && (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
              <p className="text-base text-foreground/75">Ask a question to get started.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {examplePrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submit(prompt)}
                    className="rounded-full border border-foreground/20 px-3.5 py-2 text-[13px] text-foreground/85 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {history.map((entry) => (
            <ResultCard key={entry.id} entry={entry} onSuggestionClick={submit} />
          ))}

          {isPendingHere && (
            <div className="flex items-center gap-3 rounded-lg border border-border p-4">
              <ThinkingOrb state="solving" size={20} aria-label="Running your query…" />
              <span className="text-sm text-muted-foreground">Running your query…</span>
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
        className="shrink-0 px-4 pt-2 pb-4 sm:px-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-2">
          {/* Phase 8.10 Layer 2: Show continuation context */}
          {activePendingInteraction && (
            <div className="rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
              <p className="flex items-center gap-2 font-semibold text-foreground">
                <CornerDownRight className="size-4 text-primary" aria-hidden="true" />
                <span>
                  {activePendingInteraction.kind === "clarification"
                    ? "Please clarify your previous question"
                    : "Please select an alternative capability"}
                </span>
              </p>
            </div>
          )}

          <div className="flex items-end gap-2 rounded-2xl border border-border bg-surface p-2 shadow-panel transition-colors focus-within:border-foreground/30 focus-within:ring-2 focus-within:ring-ring/40">
            <label htmlFor="query-input" className="sr-only">
              Ask a question
            </label>
            <textarea
              id="query-input"
              ref={textareaRef}
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                const el = e.target;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
              }}
              placeholder={
                activePendingInteraction
                  ? activePendingInteraction.kind === "clarification"
                    ? "Enter the location or identifier..."
                    : "Enter your capability choice..."
                  : activeDomain.chat.placeholder
              }
              rows={1}
              className="max-h-40 min-h-11 w-full resize-none bg-transparent px-2 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit(question);
                }
              }}
            />

            <Button
              type="submit"
              disabled={mutation.isPending || !question.trim()}
              aria-label="Send question"
              className="ember-cta size-11 shrink-0 rounded-xl"
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ResultCard({
  entry,
  onSuggestionClick,
}: {
  entry: ChatEntry;
  onSuggestionClick: (question: string) => void;
}) {
  const { question, result } = entry;
  const success = result.success;

  // LLM Integration Layer 0: a conversational turn (greeting/meta-
  // capability/deflection) is plain prose, not a row-table JSON payload
  // - rendered as a chat message, never run through JSON.parse (which
  // would otherwise misreport it as "not valid JSON" and dump it in a
  // monospace block).
  const isConversational =
    success && "answerability" in result && result.answerability?.status === "conversational";

  // Phase 8.10 Layer 2: Treat continuation prompts differently from errors
  const isContinuation = !success && "pendingInteractionId" in result && !!result.pendingInteractionId;
  const isError = !success && !isContinuation;

  let rows: unknown = null;
  let parseError: string | null = null;

  if (success && !isConversational && result.answer) {
    try {
      rows = JSON.parse(result.answer);
    } catch {
      parseError = "Response was not valid JSON - shown as raw text below.";
    }
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        isError ? "border-destructive/40 bg-destructive/5" : "border-border",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{question}</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            isConversational
              ? "bg-muted text-muted-foreground"
              : success
              ? "bg-success/15 text-success"
              : isContinuation
              ? "bg-primary/15 text-primary"
              : "bg-destructive/15 text-destructive",
          )}
        >
          {isConversational ? "chat" : success ? "success" : isContinuation ? "needs clarification" : "failure"}
        </span>
      </div>

      {isConversational && (
        <p className="mb-2 text-sm text-foreground">{result.answer}</p>
      )}

      {"trace" in result && result.trace && result.trace.length > 0 && (
        <PhasePipeline trace={result.trace} />
      )}

      {"llmCalls" in result && <CallTrace result={result} clientMs={entry.clientMs} />}

      {"metadata" in result && result.metadata?.rowCount !== undefined && (
        <p className="mb-2 text-xs text-muted-foreground">
          rowCount: {result.metadata.rowCount}
        </p>
      )}
      
      {/* Phase 8.10 Layer 2: Show continuation prompt */}
      {isContinuation && result.answer && (
        <div className="mb-2 rounded-md border border-primary/40 bg-primary/10 p-3 text-sm">
          <p className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            {entry.interactionKind === "clarification" ? (
              <>
                <MapPin className="size-4 text-primary" aria-hidden="true" />
                <span>Clarification needed</span>
              </>
            ) : (
              <>
                <Lightbulb className="size-4 text-primary" aria-hidden="true" />
                <span>Alternative available</span>
              </>
            )}
          </p>
          <p className="text-foreground">{result.answer}</p>
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">
          {"error" in result && result.error
            ? result.error
            : "The backend returned a failure with no error message."}
        </p>
      )}

      {/* LLM Integration Layer 3: purely additive - only rendered when
          the backend's own numeric cross-check already accepted it; the
          raw rows table below is completely unaffected either way. */}
      {success && "summary" in result && result.summary && (
        <p className="mb-2 whitespace-pre-line text-sm text-foreground">{result.summary}</p>
      )}

      {success && parseError && (
        <>
          <p className="mb-1 text-xs text-muted-foreground">{parseError}</p>
          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
            {result.answer}
          </pre>
        </>
      )}

      {success && !parseError && Array.isArray(rows) && rows.length > 0 && (
        <RowsTable rows={rows as Record<string, unknown>[]} />
      )}

      {success && !parseError && Array.isArray(rows) && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Zero rows returned (execution succeeded, no matching data).
        </p>
      )}

      {success && !parseError && !Array.isArray(rows) && rows !== null && (
        <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(rows, null, 2)}
        </pre>
      )}

      {/* Tier1 Task 6: every response can carry 2-3 follow-up chips, same submit() path as a manual question. */}
      {"suggestions" in result && result.suggestions && result.suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
          {result.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestionClick(suggestion)}
              className="rounded-full border border-foreground/20 px-3.5 py-2 text-[13px] text-foreground/85 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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
function PhasePipeline({ trace }: { trace: PhaseGateTraceEntry[] }) {
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
function CallTrace({ result, clientMs }: { result: ChatResponse; clientMs?: number | undefined }) {
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

function RowsTable({ rows }: { rows: Record<string, unknown>[] }) {
  const columns = Object.keys(rows[0] ?? {});

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border text-left">
            {columns.map((col) => (
              <th key={col} className="px-2 py-1 font-medium">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/50">
              {columns.map((col) => (
                <td key={col} className="px-2 py-1">
                  {String(row[col] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
