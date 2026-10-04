import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ThinkingOrb } from "thinking-orbs";

import { askOrchestrator, OrchestratorConfigError, type ChatResponse } from "../api/orchestrator";
import { useFacilityNames } from "../lib/facility-names";
import { useCanvas } from "../stores/canvas.store";
import { useChatHistory, type ChatEntry } from "../stores/chat-history.store";
import { activeDomain } from "@/domains";
import { Canvas } from "./Canvas";
import { Composer } from "./Composer";
import { QuestionBubble } from "./QuestionBubble";
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

// A stable empty list, so a chat with no entries yet does not look "changed" on every render.
const NO_ENTRIES: ChatEntry[] = [];

const scrollBehavior = (): ScrollBehavior =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

// What a screen reader hears when a request settles (the visible result is a long card, so it is not read out).
function announcementFor(result: ChatResponse): string {
  if (result.pendingInteractionId) return "More detail is needed. Choose an option or type one.";
  if (!result.success) return result.error ?? "The request failed.";
  if (result.answerability?.status === "conversational") return "Reply ready.";
  const count = result.metadata?.rowCount;
  return count ? `Answer ready, ${count} results.` : "Answer ready.";
}

export function QueryConsole() {
  const { conversationId } = useParams();
  const navigate = useNavigate();
  // Starts the name-map load as soon as the chat page mounts, so names are ready before the first answer.
  useFacilityNames();
  const conversation = useChatHistory((state) => (conversationId ? state.conversations[conversationId] : undefined));
  const startConversation = useChatHistory((state) => state.startConversation);
  const appendEntry = useChatHistory((state) => state.appendEntry);

  const [announcement, setAnnouncement] = useState("");
  // A fresh random 8 for each new chat, so starting over never shows the same prompts.
  const examplePrompts = useMemo(() => pickRandomPrompts(activeDomain.chat.examplePrompts, 6), [conversationId]);

  const history = conversation?.entries ?? NO_ENTRIES;
  const activePendingInteraction = conversation?.pendingInteraction ?? null;

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastEntryRef = useRef<HTMLDivElement>(null);

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
      setAnnouncement(announcementFor(result));
    },
    onError: (error, vars) => {
      console.error("[orchestrator request failed]", error);
      // A setup problem keeps its own message; anything else (network, a non-JSON reply) gets a cause and a next step.
      const message = error instanceof OrchestratorConfigError ? error.message : "I couldn't reach the analysis service. Check your connection and try again.";
      appendEntry(
        vars.conversationId,
        {
          id: crypto.randomUUID(),
          question: vars.q,
          result: {
            success: false,
            answer: "",
            error: message,
          },
          clientMs: Math.round(performance.now() - vars.startedAt),
        },
        null,
      );
      setAnnouncement(message);
    },
  });

  const isPendingHere = mutation.isPending && mutation.variables?.conversationId === conversationId;

  const canvasEntryId = useCanvas((state) => state.entryId);
  const closeCanvas = useCanvas((state) => state.close);
  const canvasEntry = history.find((entry) => entry.id === canvasEntryId && entry.result.success) ?? null;

  // A question just sent: keep it and the loading row in view at the bottom.
  useEffect(() => {
    if (isPendingHere) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: scrollBehavior() });
  }, [isPendingHere]);

  // An answer landed: bring the top of the newest turn (question and summary) into view, not its footer.
  useEffect(() => {
    const container = scrollRef.current;
    const latest = lastEntryRef.current;
    if (!container || !latest) return;
    const offset = latest.getBoundingClientRect().top - container.getBoundingClientRect().top;
    container.scrollTo({ top: container.scrollTop + offset - 16, behavior: scrollBehavior() });
  }, [history.length]);

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

    setAnnouncement("Running your query…");
    mutation.mutate({
      conversationId: targetId,
      q: trimmed,
      pendingId: currentPendingId,
      contResp: isContinuation ? trimmed : undefined,
      startedAt: performance.now(),
    });
  }

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
      {/* contain-paint keeps content that scrolls inside this box (an open process panel, a long table) from adding height to the page. */}
      <div ref={scrollRef} className="contain-paint flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

          {history.map((entry, index) => (
            <div key={entry.id} ref={index === history.length - 1 ? lastEntryRef : undefined}>
              <ResultCard entry={entry} onSuggestionClick={submit} />
            </div>
          ))}

          {isPendingHere && mutation.variables && (
            <div className="flex flex-col gap-4">
              <QuestionBubble>{mutation.variables.q}</QuestionBubble>
              <div className="flex items-center gap-3 text-sm">
                <ThinkingOrb state="solving" size={20} aria-label="Running your query…" />
                <span className="text-sm text-muted-foreground">Running your query…</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <p role="status" className="sr-only">
        {announcement}
      </p>

      <Composer
        pending={mutation.isPending}
        pendingInteraction={activePendingInteraction}
        placeholder={activeDomain.chat.placeholder}
        compactPlaceholder={activeDomain.chat.compactPlaceholder}
        onSubmit={submit}
      />
      </div>
      {canvasEntry && <Canvas entry={canvasEntry} onClose={closeCanvas} />}
    </div>
  );
}
