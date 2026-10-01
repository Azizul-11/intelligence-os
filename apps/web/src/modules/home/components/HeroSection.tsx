import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/shared/components/ui/button";
import { LedgerTrace } from "./LedgerTrace";

const rise = {
  hidden: { opacity: 0, y: 18 },
  shown: { opacity: 1, y: 0 },
};

export function HeroSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative isolate mx-auto max-w-6xl px-4 pt-16 pb-16 sm:px-6 sm:pt-24 sm:pb-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-0 -z-10 h-[420px] w-[560px] rounded-full opacity-60 blur-3xl"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklch, var(--color-primary), transparent 78%), transparent)",
        }}
      />

      <motion.div
        initial={reduceMotion ? undefined : "hidden"}
        animate={reduceMotion ? undefined : "shown"}
        transition={{ staggerChildren: 0.12 }}
        className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16"
      >
        <div>
          <motion.h1
            variants={rise}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-4xl leading-[1.1] font-semibold tracking-tight text-foreground sm:text-5xl"
          >
            Every answer is computed. None of them are guessed.
          </motion.h1>

          <motion.p
            variants={rise}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            IntelligenceOS answers every question through a deterministic warehouse engine, and asks a
            sharper question back rather than guess.
          </motion.p>

          <motion.div
            variants={rise}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <Button
              asChild
              size="lg"
              className="bg-[linear-gradient(180deg,var(--color-primary),color-mix(in_oklch,var(--color-primary),black_14%))] shadow-panel transition-transform duration-200 hover:-translate-y-0.5 hover:brightness-95"
            >
              <Link to="/chat">
                Launch workspace
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="transition-transform duration-200 hover:-translate-y-0.5"
            >
              <a href="#ledger">See how it works</a>
            </Button>
          </motion.div>
        </div>

        <motion.div variants={rise} transition={{ duration: 0.5, ease: "easeOut" }}>
          <LedgerTrace />
        </motion.div>
      </motion.div>
    </section>
  );
}
