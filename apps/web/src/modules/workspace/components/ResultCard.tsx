import { ChevronDown, Lightbulb, MapPin, PanelRight } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

import { useFacilityNames } from "../lib/facility-names";
import { withFacilityNames, type Row } from "../lib/result-format";
import type { ChatEntry } from "../stores/chat-history.store";
import { useCanvas } from "../stores/canvas.store";
import { CallTrace, PhasePipeline } from "./CallTrace";
import { CARD_LIST_LIMIT, RankedList } from "./RankedList";

export function ResultCard({
  entry,
  onSuggestionClick,
}: {
  entry: ChatEntry;
  onSuggestionClick: (question: string) => void;
}) {
  const { question, result } = entry;
  const openCanvas = useCanvas((state) => state.open);
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

  const names = useFacilityNames();
  const namedRows = Array.isArray(rows) ? withFacilityNames(rows as Row[], names) : [];

  const hasTrace = ("trace" in result && !!result.trace && result.trace.length > 0) || "llmCalls" in result;

  return (
    <div className="flex flex-col gap-4">
      {/* The question is a right-aligned bubble; the answer below reads from the left, like a chat reply. */}
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-2.5 text-sm text-foreground sm:max-w-[70%]">{question}</p>
      </div>

      <div className="flex w-full flex-col gap-3 text-sm">
      {isConversational && <p className="max-w-prose text-foreground">{result.answer}</p>}

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
        <p role="alert" className="text-sm text-destructive">
          {"error" in result && result.error
            ? result.error
            : "The backend returned a failure with no error message."}
        </p>
      )}

      {/* LLM Integration Layer 3: purely additive - only rendered when
          the backend's own numeric cross-check already accepted it; the
          raw rows table below is completely unaffected either way. */}
      {success && "summary" in result && result.summary && (
        <p className="max-w-prose whitespace-pre-line text-sm text-foreground">{result.summary}</p>
      )}

      {success && parseError && (
        <>
          <p className="mb-1 text-xs text-muted-foreground">{parseError}</p>
          <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
            {result.answer}
          </pre>
        </>
      )}

      {success && !parseError && Array.isArray(rows) && rows.length > 0 && <RankedList rows={namedRows} />}

      {success && !parseError && Array.isArray(rows) && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {rows.length > CARD_LIST_LIMIT
              ? `Showing ${CARD_LIST_LIMIT} of ${rows.length} results`
              : `${rows.length} results returned`}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openCanvas(entry.id)}
            className="min-h-11 gap-2 px-3"
          >
            <PanelRight className="size-4" aria-hidden="true" />
            {rows.length > CARD_LIST_LIMIT ? `See all ${rows.length} in canvas` : "Open in canvas"}
          </Button>
        </div>
      )}

      {success && !parseError && Array.isArray(rows) && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No results returned (the query ran, but nothing matched).
        </p>
      )}

      {success && !parseError && !Array.isArray(rows) && rows !== null && (
        <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
          {JSON.stringify(rows, null, 2)}
        </pre>
      )}

      {/* Tier1 Task 6: every response can carry 2-3 follow-up chips, same submit() path as a manual question. */}
      {"suggestions" in result && result.suggestions && result.suggestions.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-2">
          {result.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestionClick(suggestion)}
              className="inline-flex min-h-11 items-center rounded-full border border-foreground/20 px-3.5 text-sm text-foreground/85 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}

      {/* The gate trace and LLM calls are for debugging; they stay one click away, below the answer. */}
      {hasTrace && (
        <details className="group text-sm text-muted-foreground">
          <summary className="inline-flex min-h-11 cursor-pointer select-none items-center gap-1.5 rounded-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            How this was answered
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-2">
            {"trace" in result && result.trace && result.trace.length > 0 && <PhasePipeline trace={result.trace} />}
            {"llmCalls" in result && <CallTrace result={result} clientMs={entry.clientMs} />}
          </div>
        </details>
      )}
      </div>
    </div>
  );
}
