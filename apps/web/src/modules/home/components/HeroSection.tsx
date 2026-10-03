import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/shared/components/ui/button";
import { RunTimeline } from "./RunTimeline";

const rise = {
  hidden: { opacity: 0, y: 18 },
  shown: { opacity: 1, y: 0 },
};

export function HeroSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="relative isolate mx-auto max-w-6xl px-4 pt-16 pb-24 sm:px-6 sm:pt-28 sm:pb-24">
      <div aria-hidden="true" className="ember-wash pointer-events-none absolute -top-24 -bottom-24 left-1/2 -z-10 w-screen -translate-x-1/2" />

      <motion.div
        initial={reduceMotion ? undefined : "hidden"}
        animate={reduceMotion ? undefined : "shown"}
        transition={{ staggerChildren: 0.12 }}
        className="grid grid-cols-1 items-center gap-14 lg:grid-cols-[1.1fr_1fr] lg:gap-20"
      >
        <div>
          <motion.h1
            variants={rise}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="text-4xl leading-[1.05] font-semibold tracking-tight text-foreground sm:text-5xl lg:text-6xl"
          >
            Every answer is computed. None of them are guessed.
          </motion.h1>

          <motion.p
            variants={rise}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mt-6 max-w-lg text-base leading-relaxed text-muted-foreground sm:text-lg"
          >
            Ask plain-English questions of your data. A deterministic engine computes every figure, and when a question
            is ambiguous it asks one precise question instead of guessing.
          </motion.p>

          <motion.div
            variants={rise}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Button asChild size="lg" className="h-11 ember-cta">
              <Link to="/chat">
                Open the query console
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-11 border-foreground/35">
              <a href="#ledger">See how it works</a>
            </Button>
          </motion.div>
        </div>

        <motion.div variants={rise} transition={{ duration: 0.5, ease: "easeOut" }}>
          <RunTimeline />
        </motion.div>
      </motion.div>
    </section>
  );
}
