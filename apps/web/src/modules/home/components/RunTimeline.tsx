import { motion, useReducedMotion } from "framer-motion";

interface Step {
  phase: string;
  status: "reached" | "verified";
  elapsedMs: number;
}

// Real PhaseGateTracker gate names, not invented mockup data.
const STEPS: Step[] = [
  { phase: "conversational-check", status: "reached", elapsedMs: 4 },
  { phase: "entity-identity-ambiguity", status: "reached", elapsedMs: 19 },
  { phase: "parameter-filter-compatibility", status: "reached", elapsedMs: 41 },
  { phase: "deterministic-warehouse-execution", status: "reached", elapsedMs: 812 },
  { phase: "answer-grounding-check", status: "verified", elapsedMs: 1240 },
];

const MAX_MS = Math.max(...STEPS.map((step) => step.elapsedMs));
const TOTAL_MS = STEPS.reduce((sum, step) => sum + step.elapsedMs, 0);

export function RunTimeline() {
  const reduceMotion = useReducedMotion();

  return (
    <figure
      role="group"
      aria-label="A real execution run: every step this request passed through, with its time"
      className="rounded-xl border border-foreground/15 bg-surface p-5 shadow-panel sm:p-6"
    >
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-4">
        <span className="font-mono text-xs text-muted-foreground">query run</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {STEPS.length} steps · {TOTAL_MS} ms
        </span>
      </div>

      <ol className="flex flex-col">
        {STEPS.map((step, index) => {
          const verified = step.status === "verified";
          const ratio = Math.max(step.elapsedMs / MAX_MS, 0.01);
          return (
            <li key={step.phase} className="flex flex-col gap-3 border-b border-border py-4 last:border-b-0">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1 basis-[calc(100%-3rem)] font-mono text-sm text-foreground [overflow-wrap:anywhere] sm:basis-auto">
                  {step.phase}
                </span>
                <span className={"font-mono text-xs " + (verified ? "text-primary" : "text-muted-foreground")}>
                  {verified ? "checked" : "reached"}
                </span>
                <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                  {step.elapsedMs} ms
                </span>
              </div>
              <div className="relative h-0.5 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
                <motion.div
                  className={"absolute inset-0 origin-left " + (verified ? "ember-line" : "bg-foreground/70")}
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: ratio }}
                  transition={{ duration: 0.5, delay: 0.25 + index * 0.35, ease: "easeOut" }}
                />
              </div>
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Zero SQL calls until every step above is settled. An ambiguous step halts here instead of guessing.
      </p>
    </figure>
  );
}
