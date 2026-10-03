import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

import { Button } from "@/shared/components/ui/button";

export function LaunchBand() {
  return (
    <section className="relative overflow-hidden ember-band">
      <div aria-hidden="true" className="ember-line absolute inset-x-0 top-0 h-px" />
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-24 sm:px-6 sm:py-24 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="max-w-2xl text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Ask one question. See every step it took.
          </h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            No account needed. Every answer shows the steps it took to reach it.
          </p>
        </div>

        <Button asChild size="lg" className="h-11 ember-cta">
          <Link to="/chat">
            Open the query console
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
