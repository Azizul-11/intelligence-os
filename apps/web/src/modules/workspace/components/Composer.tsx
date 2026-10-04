import { useRef, useState } from "react";
import { ArrowUp, CornerDownRight, LoaderCircle } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

import type { PendingInteraction } from "../stores/chat-history.store";

type ComposerProps = {
  pending: boolean;
  pendingInteraction: PendingInteraction | null;
  placeholder: string;
  compactPlaceholder?: string | undefined;
  onSubmit: (question: string) => void;
};

const CONTINUATION_COPY = {
  clarification: { banner: "Clarify your previous question", placeholder: "Enter the location or identifier…", compact: "Type the location…" },
  guidance: { banner: "Select an alternative capability", placeholder: "Enter your capability choice…", compact: "Type your choice…" },
} as const;

// Owns the draft text so typing never re-renders (or re-parses) the message list above it.
export function Composer({ pending, pendingInteraction, placeholder, compactPlaceholder, onSubmit }: ComposerProps) {
  const [question, setQuestion] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const continuation = pendingInteraction ? CONTINUATION_COPY[pendingInteraction.kind] : null;

  function submit() {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    onSubmit(trimmed);
    setQuestion("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="shrink-0 pt-2 pb-3 sm:pb-4"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 sm:px-6">
        {continuation && (
          <div className="rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <CornerDownRight className="size-4 text-primary" aria-hidden="true" />
              <span>{continuation.banner}</span>
            </p>
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border border-field bg-surface p-2 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
          <label htmlFor="query-input" className="sr-only">
            Ask a question
          </label>
          <div className="relative min-w-0 flex-1">
            {/* A one-line hint instead of the native placeholder, which wraps and grows the bar on narrow screens; the label names the field. */}
            {!question && (
              <span aria-hidden="true" className="pointer-events-none absolute inset-x-2 top-2.5 truncate text-base leading-relaxed text-muted-foreground">
                <span className="sm:hidden">{continuation ? continuation.compact : (compactPlaceholder ?? placeholder)}</span>
                <span className="hidden sm:inline">{continuation ? continuation.placeholder : placeholder}</span>
              </span>
            )}
            <textarea
              id="query-input"
              name="question"
              ref={textareaRef}
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value);
                const el = e.target;
                el.style.height = "auto";
                // max-height (shorter on phones) clamps this; the box then scrolls inside itself.
                el.style.height = `${el.scrollHeight}px`;
              }}
              rows={1}
              autoComplete="off"
              enterKeyHint="send"
              className="field-sizing-content block max-h-28 min-h-11 w-full resize-none bg-transparent px-2 py-2.5 text-base leading-relaxed outline-none sm:max-h-40"
              onKeyDown={(e) => {
                // isComposing: Enter confirms an IME candidate and must not send.
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>

          <Button
            type="submit"
            disabled={pending || !question.trim()}
            aria-label="Send question"
            className="ember-cta size-11 shrink-0 rounded-xl"
          >
            {pending ? (
              <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <ArrowUp className="size-4" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
