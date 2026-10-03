import { motion, useReducedMotion } from "framer-motion";

const ENTRIES = [
  {
    heading: "No figure is ever written by a model",
    body: "Deterministic warehouse data is the sole source of analytical truth here. A language model translates a question into a plan and restates the result. It never computes a number itself.",
  },
  {
    heading: "Semantic Validation Layer",
    body: "An ambiguous entity, place, or metric is caught before a single query runs. The request halts with zero SQL calls and asks a targeted question, instead of guessing and returning a confident, wrong answer.",
  },
  {
    heading: "One engine. Every domain.",
    body: "Semantic resolution, query planning, execution, and answerability operate identically regardless of subject. The live domain runs on this engine today, and each new domain plugs into the same core unchanged.",
  },
];

export function InvariantsLedger() {
  const reduceMotion = useReducedMotion();

  return (
    <section id="ledger" className="scroll-mt-24 mx-auto max-w-6xl px-4 py-0 sm:px-6">
      <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
        Three entries that never change
      </h2>

      <ol className="mt-16 divide-y divide-border border-y border-border">
        {ENTRIES.map((entry, index) => (
          <motion.li
            key={entry.heading}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="grid gap-4 py-10 md:grid-cols-[4rem_minmax(0,1fr)_minmax(0,1.1fr)] md:gap-10"
          >
            <span className="font-mono text-sm tabular-nums text-primary">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{entry.heading}</h3>
            <p className="text-base leading-relaxed text-muted-foreground">{entry.body}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}
