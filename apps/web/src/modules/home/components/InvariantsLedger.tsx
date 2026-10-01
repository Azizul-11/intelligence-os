import { motion } from "framer-motion";

interface Entry {
  heading: string;
  body: string;
  indent: "none" | "sm" | "lg";
}

const ENTRIES: Entry[] = [
  {
    heading: "Zero percent hallucinated analytics",
    body: "Deterministic warehouse data is the sole source of analytical truth here. A language model translates a question into a plan and restates the result. It never computes a number itself.",
    indent: "none",
  },
  {
    heading: "Semantic Validation Layer",
    body: "An ambiguous entity, place, or metric is caught before a single query runs. The request halts with zero SQL calls and asks a targeted question, instead of guessing and returning a confident, wrong answer.",
    indent: "lg",
  },
  {
    heading: "One engine. Every domain.",
    body: "Semantic resolution, query planning, execution, and answerability operate identically regardless of subject. Healthcare runs on this engine live today. Education and Finance plug into the same core next, unchanged.",
    indent: "sm",
  },
];

const INDENT_CLASS: Record<Entry["indent"], string> = {
  none: "",
  sm: "sm:ml-8",
  lg: "sm:ml-16",
};

export function InvariantsLedger() {
  return (
    <section id="ledger" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="max-w-2xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
      >
        Three entries that never change
      </motion.h2>

      <ol className="mt-10 divide-y divide-border border-t border-border">
        {ENTRIES.map((entry, index) => (
          <motion.li
            key={entry.heading}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.4, delay: index * 0.08, ease: "easeOut" }}
            className={"flex gap-6 py-8 sm:gap-10 " + INDENT_CLASS[entry.indent]}
          >
            <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
              {String(index + 1).padStart(3, "0")}
            </span>
            <div className="max-w-2xl">
              <h3 className="text-lg font-semibold text-foreground sm:text-xl">{entry.heading}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">{entry.body}</p>
            </div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
