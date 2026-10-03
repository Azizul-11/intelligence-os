import { useId, useState } from "react";
import { Check, ChevronDown, Copy, Minus, Pause, type LucideIcon } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

import type { ChatResponse } from "../api/orchestrator";
import {
  buildSteps,
  buildTimings,
  fmtMs,
  ROLE_LABELS,
  type ProcessStep,
  type StepStatus,
} from "../lib/process-trace";

const STATUS_ICON: Record<StepStatus, LucideIcon> = { completed: Check, skipped: Minus, halted: Pause };
const STATUS_ICON_CLASS: Record<StepStatus, string> = {
  completed: "text-success",
  skipped: "text-muted-foreground",
  halted: "text-primary",
};

// Only halted and skipped steps need a subtitle: the checkmark already says a step completed.
function stepSubtitle(step: ProcessStep): string | undefined {
  if (step.status === "halted") return step.reason ? `Halted (${step.reason.replace(/_/g, " ")})` : "Halted";
  if (step.status === "skipped") return "Not reached";
  return undefined;
}

function StepLabel({ step }: { step: ProcessStep }) {
  const subtitle = stepSubtitle(step);
  return (
    <span className="min-w-0 flex-1">
      <span
        className={cn("block text-sm", step.status === "skipped" ? "text-muted-foreground" : "text-foreground")}
        title={step.known ? undefined : `Raw step: ${step.phase}`}
      >
        {step.label}
      </span>
      {subtitle && <span className="block text-xs text-muted-foreground">{subtitle}</span>}
    </span>
  );
}

// The diagnostic payload of one step. Rendered only for steps that carry a `detail`, and only while that row is open.
function StepDetail({ id, detail }: { id: string; detail: Record<string, string | number | boolean> }) {
  return (
    <pre
      id={id}
      className="process-enter mb-2 ml-7 whitespace-pre-wrap rounded-md bg-muted p-3 font-mono text-xs leading-relaxed text-foreground [overflow-wrap:anywhere]"
    >
      {JSON.stringify(detail, null, 2)}
    </pre>
  );
}

function StepRow({ step }: { step: ProcessStep }) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  const Icon = STATUS_ICON[step.status];
  const duration =
    step.durationMs !== undefined ? (
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmtMs(step.durationMs)}</span>
    ) : null;

  // A step with no diagnostic payload is a static row: no button, and no empty chevron.
  if (!step.detail) {
    return (
      <li className="flex min-h-11 items-center gap-3 py-1.5">
        <Icon className={cn("size-4 shrink-0", STATUS_ICON_CLASS[step.status])} aria-hidden="true" />
        <StepLabel step={step} />
        {duration}
      </li>
    );
  }

  return (
    <li className="py-0.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-3 rounded-md py-1.5 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon className={cn("size-4 shrink-0", STATUS_ICON_CLASS[step.status])} aria-hidden="true" />
        <StepLabel step={step} />
        {duration}
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      {open && <StepDetail id={detailId} detail={step.detail} />}
    </li>
  );
}

function Timings({ result, clientMs }: { result: Partial<ChatResponse>; clientMs?: number }) {
  const timings = buildTimings(result, clientMs);
  const items: [string, number | undefined][] = [
    ["Server total", timings.serverMs],
    ["Browser round trip", timings.browserMs],
    ["Network and startup", timings.networkMs],
    ["Warehouse query", timings.warehouseMs],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="text-sm tabular-nums text-foreground">{value !== undefined ? fmtMs(value) : "Not recorded"}</dd>
        </div>
      ))}
    </dl>
  );
}

function RequestId({ requestId }: { requestId: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(requestId);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
      <p className="min-w-0 text-xs text-muted-foreground">
        Request ID{" "}
        <span className="font-mono text-foreground/70 [overflow-wrap:anywhere]">{requestId}</span>
      </p>
      <Button type="button" variant="outline" size="sm" onClick={copy} aria-label="Copy request ID" className="min-h-11 gap-2 px-3">
        {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <span role="status" className="sr-only">
        {copied ? "Request ID copied" : ""}
      </span>
    </div>
  );
}

// Rendered only while open. Mounting it is what animates it in (.process-enter), and nothing is left in the page when it closes.
export function ProcessPanel({
  id,
  result,
  clientMs,
}: {
  id: string;
  result: Partial<ChatResponse>;
  clientMs?: number;
}) {
  const trace = result.trace ?? [];
  const steps = buildSteps(trace);
  // The intent triage call is internal plumbing (casual-or-data routing), so it is not listed. Its latency still counts in the timings.
  const calls = (result.llmCalls ?? []).filter((call) => call.role !== "intent");
  const rejected = result.metadata?.summaryRejected;

  return (
    <section
      id={id}
      aria-label="Query process"
      className="process-enter mt-1 flex flex-col gap-4 rounded-lg border border-border bg-surface p-4"
    >
      <Timings result={result} clientMs={clientMs} />

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">Pipeline steps</p>
        {trace.length === 0 ? (
          <p className="text-sm text-muted-foreground">No diagnostic process recorded for this response.</p>
        ) : (
          <ol className="divide-y divide-border/60">
            {steps.map((step, index) => (
              <StepRow key={`${step.phase}-${index}`} step={step} />
            ))}
          </ol>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">Model calls</p>
        {calls.length === 0 ? (
          <p className="text-sm text-muted-foreground">No model calls for this response.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {calls.map((call, index) => (
              <li key={`${call.role}-${index}`} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">{ROLE_LABELS[call.role] ?? call.role}</p>
                  <p className="break-words text-xs text-muted-foreground">
                    {call.provider} · {call.model}
                    {call.fallbackUsed ? " · fallback used" : ""}
                  </p>
                </div>
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmtMs(call.latencyMs)}</p>
              </li>
            ))}
          </ul>
        )}
        {rejected && (
          <p className="pt-1 text-xs text-muted-foreground">A summary sentence was withheld: {rejected.reason}.</p>
        )}
      </div>

      {result.requestId && <RequestId requestId={result.requestId} />}
    </section>
  );
}
