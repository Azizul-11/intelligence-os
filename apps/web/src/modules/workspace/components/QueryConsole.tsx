import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

import {
  askOrchestrator,
  type ChatResponse,
} from "../api/orchestrator";

/**
 * Example prompts covering already-verified capabilities only, per the
 * DOGFOODING 3.0 Fix / Defer Decision Report. These are plain examples that
 * populate the input - clicking one sends the identical text through the
 * same askOrchestrator() call as manual typing. No special-casing anywhere.
 */
const EXAMPLE_PROMPTS = [
  "highest rated hospitals",
  "best hospitals in Texas",
  "best hospitals for mortality",
  "best hospitals for patient experience",
  "how many hospitals are in California",
  "hospitals in Texas",
  "best hospitals for safety",
  "which hospitals have the best overall rating and lowest mortality",
];

interface HistoryEntry {
  id: number;
  question: string;
  result: ChatResponse | { success: false; error: string; answer: "" };
}

let nextId = 0;

export function QueryConsole() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const mutation = useMutation({
    mutationFn: (q: string) => askOrchestrator(q, "healthcare"),
  });

  function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed || mutation.isPending) return;

    mutation.mutate(trimmed, {
      onSuccess: (result) => {
        setHistory((prev) => [
          { id: nextId++, question: trimmed, result },
          ...prev,
        ]);
      },
      onError: (error) => {
        setHistory((prev) => [
          {
            id: nextId++,
            question: trimmed,
            result: {
              success: false,
              answer: "",
              error:
                error instanceof Error
                  ? error.message
                  : "Request failed.",
            },
          },
          ...prev,
        ]);
      },
    });

    setQuestion("");
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">
          IntelligenceOS Dogfooding Console
        </h2>
        <p className="text-sm text-muted-foreground">
          Sends your question directly to the real orchestrator backend -
          real semantic resolution, real planning, real deterministic
          execution against the real warehouse. Nothing is simulated,
          summarized, or corrected client-side.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
        className="flex flex-col gap-3"
      >
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a question, e.g. &quot;highest rated hospitals&quot;"
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(question);
            }
          }}
        />

        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setQuestion(prompt)}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {prompt}
              </button>
            ))}
          </div>

          <Button
            type="submit"
            disabled={mutation.isPending || !question.trim()}
          >
            {mutation.isPending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-4">
        {history.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No queries sent yet.
          </p>
        )}

        {history.map((entry) => (
          <ResultCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function ResultCard({ entry }: { entry: HistoryEntry }) {
  const { question, result } = entry;
  const success = result.success;

  let rows: unknown = null;
  let parseError: string | null = null;

  if (success && result.answer) {
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
        success ? "border-border" : "border-destructive/40 bg-destructive/5",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{question}</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            success
              ? "bg-primary/10 text-primary"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {success ? "success" : "failure"}
        </span>
      </div>

      {"metadata" in result && result.metadata?.rowCount !== undefined && (
        <p className="mb-2 text-xs text-muted-foreground">
          rowCount: {result.metadata.rowCount}
          {result.metadata.executionTimeMs !== undefined &&
            ` · ${result.metadata.executionTimeMs}ms`}
        </p>
      )}

      {!success && (
        <p className="text-sm text-destructive">
          {"error" in result && result.error
            ? result.error
            : "The backend returned a failure with no error message."}
        </p>
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
