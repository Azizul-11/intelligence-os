import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowUp, CornerDownRight } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { ThinkingOrb } from "thinking-orbs";

import { Button } from "@/shared/components/ui/button";

import { askOrchestrator } from "../api/orchestrator";
import { useFacilityNames } from "../lib/facility-names";
import { useCanvas } from "../stores/canvas.store";
import { useChatHistory } from "../stores/chat-history.store";
import { activeDomain } from "@/domains";
import { Canvas } from "./Canvas";
import { ResultCard } from "./ResultCard";


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
  // Starts the name-map load as soon as the chat page mounts, so names are ready before the first answer.
  useFacilityNames();
  const conversation = useChatHistory((state) => (conversationId ? state.conversations[conversationId] : undefined));
  const startConversation = useChatHistory((state) => state.startConversation);
  const appendEntry = useChatHistory((state) => state.appendEntry);

  const [question, setQuestion] = useState("");
  // A fresh random 8 for each new chat, so starting over never shows the same prompts.
  const examplePrompts = useMemo(() => pickRandomPrompts(activeDomain.chat.examplePrompts, 6), [conversationId]);

  const history = conversation?.entries ?? [];
  const activePendingInteraction = conversation?.pendingInteraction ?? null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Saved from the mutation's own options, not per-call callbacks, so a reply still lands in its chat if the user navigates away first.
  const mutation = useMutation({
    mutationFn: ({ q, pendingId, contResp }: SubmitVariables) => askOrchestrator(q, activeDomain.id, pendingId, contResp),
    onSuccess: (result, vars) => {
      const entryId = crypto.randomUUID();
      appendEntry(
        vars.conversationId,
        {
          id: entryId,
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

  const canvasEntryId = useCanvas((state) => state.entryId);
  const closeCanvas = useCanvas((state) => state.close);
  const canvasEntry = history.find((entry) => entry.id === canvasEntryId && entry.result.success) ?? null;

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
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
      {/* contain-paint keeps content that scrolls inside this box (an open process panel, a long table) from adding height to the page. */}
      <div ref={scrollRef} className="contain-paint flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 sm:px-6">
          {history.length === 0 && !isPendingHere && (
            <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
              <p className="text-base text-foreground/75">Ask a question to get started.</p>
              <div className="flex flex-wrap justify-center gap-2">
                {examplePrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => submit(prompt)}
                    className="inline-flex min-h-11 items-center rounded-full border border-foreground/20 px-3.5 text-sm text-foreground/85 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <div className="flex items-center gap-3 text-sm">
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
        className="shrink-0 pt-2 pb-4"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 sm:px-6">
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

          <div className="flex items-end gap-2 rounded-xl border border-border bg-surface p-2 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary">
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
              className="field-sizing-content max-h-40 min-h-11 w-full resize-none bg-transparent px-2 py-2.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
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
      {canvasEntry && <Canvas entry={canvasEntry} onClose={closeCanvas} />}
    </div>
  );
}


