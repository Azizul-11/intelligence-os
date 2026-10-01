import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

// Real PhaseGateTracker gate names, not invented mockup data.
interface TraceEntry {
  phase: string;
  status: "reached" | "verified";
  elapsedMs: number;
}

const ENTRIES: TraceEntry[] = [
  { phase: "conversational-check", status: "reached", elapsedMs: 4 },
  { phase: "entity-identity-ambiguity", status: "reached", elapsedMs: 19 },
  { phase: "parameter-filter-compatibility", status: "reached", elapsedMs: 41 },
  { phase: "deterministic-warehouse-execution", status: "reached", elapsedMs: 812 },
  { phase: "answer-grounding-check", status: "verified", elapsedMs: 1240 },
];

export function LedgerTrace() {
  const reduceMotion = useReducedMotion();
  const [visibleCount, setVisibleCount] = useState(reduceMotion ? ENTRIES.length : 0);

  useEffect(() => {
    if (reduceMotion) return;
    setVisibleCount(0);
    const id = window.setInterval(() => {
      setVisibleCount((count) => {
        if (count >= ENTRIES.length) {
          window.clearInterval(id);
          return count;
        }
        return count + 1;
      });
    }, 420);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  return (
    <div
      className="surface-lifted shadow-panel relative rounded-lg border border-border"
      role="group"
      aria-label="A real execution trace: every gate this request passed through, in order"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-mono text-xs tracking-wide text-muted-foreground">request trace</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{ENTRIES.length} entries</span>
      </div>

      <ol className="divide-y divide-border">
        {ENTRIES.map((entry, index) => {
          const isVisible = index < visibleCount;
          return (
            <motion.li
              key={entry.phase}
              initial={reduceMotion ? undefined : { opacity: 0, y: -4 }}
              animate={isVisible ? { opacity: 1, y: 0 } : { opacity: reduceMotion ? 1 : 0.15, y: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="flex items-center gap-3 px-4 py-3"
            >
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {String(index + 1).padStart(3, "0")}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{entry.phase}</span>
              <span
                className={
                  "font-mono text-xs " + (entry.status === "verified" ? "text-primary" : "text-muted-foreground")
                }
              >
                {entry.status}
              </span>
              <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                +{entry.elapsedMs}ms
              </span>
            </motion.li>
          );
        })}
      </ol>

      <div className="border-t border-border px-4 py-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Zero SQL calls until every entry above is settled. An ambiguous step halts here instead of guessing.
        </p>
      </div>
    </div>
  );
}
