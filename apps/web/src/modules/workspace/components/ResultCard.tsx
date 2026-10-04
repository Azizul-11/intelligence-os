import { useId, useState } from "react";
import { CircleAlert, Info, Lightbulb, MapPin, PanelRight, PanelRightClose, Workflow } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

import { useFacilityNames } from "../lib/facility-names";
import { activeDomain } from "@/domains";

import { displayValue, withFacilityNames, type Row } from "../lib/result-format";
import type { ChatEntry } from "../stores/chat-history.store";
import { useCanvas } from "../stores/canvas.store";
import { CARD_LIST_LIMIT, RankedList } from "./RankedList";
import { ProcessPanel } from "./ProcessPanel";
import { QuestionBubble } from "./QuestionBubble";

export function ResultCard({
  entry,
  onSuggestionClick,
}: {
  entry: ChatEntry;
  onSuggestionClick: (question: string) => void;
}) {
  const { question, result } = entry;
  const openCanvas = useCanvas((state) => state.open);
  const closeCanvas = useCanvas((state) => state.close);
  // True while this answer is the one shown in the canvas, so its button can offer to close it.
  const canvasOpen = useCanvas((state) => state.entryId === entry.id);
  const [processOpen, setProcessOpen] = useState(false);
  const processId = useId();
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
  // The backend declined on purpose (out of scope, not answerable): a calm notice, not a failure. No answerability = a real error.
  const isRefusal = isError && "answerability" in result && !!result.answerability;
  const errorMessage = "error" in result && result.error ? result.error : "The backend returned a failure with no error message.";

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
  const visualizer = activeDomain.visualizers?.find((candidate) => candidate.matches(namedRows));

  return (
    <div className="flex flex-col gap-4">
      {/* The question is a right-aligned bubble; the answer below reads from the left, like a chat reply. */}
      <QuestionBubble>{question}</QuestionBubble>

      <div className="flex w-full flex-col gap-3 text-sm">
      {isConversational && <p className="max-w-prose text-base leading-relaxed text-foreground">{result.answer}</p>}

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
          <p className="text-base leading-relaxed text-foreground">{result.answer}</p>
        </div>
      )}

      {isRefusal && (
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <p className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <Info className="size-4 text-primary" aria-hidden="true" />
            <span>I can&rsquo;t answer that directly</span>
          </p>
          <p className="text-base leading-relaxed text-foreground">{errorMessage}</p>
        </div>
      )}

      {isError && !isRefusal && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="flex items-start gap-2 text-base text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => onSuggestionClick(question)} className="min-h-11 px-3">
            Try again
          </Button>
        </div>
      )}

      {/* LLM Integration Layer 3: purely additive - only rendered when
          the backend's own numeric cross-check already accepted it; the
          raw rows table below is completely unaffected either way. */}
      {success && "summary" in result && result.summary && (
        <p className="max-w-prose whitespace-pre-line text-base leading-relaxed text-foreground">{result.summary}</p>
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

      {/* Actions for every answer: the result count and canvas when there are rows, and the process view always. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {success && !parseError && Array.isArray(rows) && rows.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {rows.length > CARD_LIST_LIMIT
              ? `Showing ${CARD_LIST_LIMIT} of ${rows.length} results`
              : `${rows.length} ${rows.length === 1 ? "result" : "results"} returned`}
          </p>
        ) : (
          <span />
        )}
        <div className="flex flex-wrap items-center gap-2">
          {success && !parseError && Array.isArray(rows) && rows.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => (canvasOpen ? closeCanvas() : openCanvas(entry.id))}
              className="min-h-11 gap-2 px-3"
            >
              {canvasOpen ? <PanelRightClose className="size-4" aria-hidden="true" /> : <PanelRight className="size-4" aria-hidden="true" />}
              {canvasOpen ? "Close canvas" : (visualizer?.openLabel ?? (rows.length > CARD_LIST_LIMIT ? `See all ${rows.length} in canvas` : "Open in canvas"))}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={processOpen}
            aria-controls={processOpen ? processId : undefined}
            onClick={() => setProcessOpen((open) => !open)}
            className="min-h-11 gap-2 px-3"
          >
            <Workflow className="size-4" aria-hidden="true" />
            {processOpen ? "Hide process" : "View process"}
          </Button>
        </div>
      </div>

      {processOpen && <ProcessPanel id={processId} result={result} clientMs={entry.clientMs} />}

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
              {displayValue(suggestion)}
            </button>
          ))}
        </div>
      )}

      </div>
    </div>
  );
}
