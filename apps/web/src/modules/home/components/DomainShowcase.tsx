import { useState, useRef, type KeyboardEvent } from "react";
import { motion } from "framer-motion";
import { Stethoscope, GraduationCap, Landmark } from "lucide-react";

import { Badge } from "@/shared/components/ui/badge";
import { SpotlightCard } from "@/shared/components/ui/spotlight-card";

interface DomainTab {
  id: string;
  label: string;
  icon: typeof Stethoscope;
  status: "active" | "upcoming";
  headline: string;
  description: string;
  features: string[];
}

const DOMAINS: DomainTab[] = [
  {
    id: "healthcare",
    label: "Healthcare",
    icon: Stethoscope,
    status: "active",
    headline: "Domain SDK #1, live today",
    description:
      "Registered against CMS Care Compare's full public dataset: hospitals, conditions, and patient-experience measures, resolved through the same core every domain shares.",
    features: [
      "56-column clinical dossiers per facility",
      "Condition-specific mortality and readmission rankings",
      "CMS benchmark badges (better, no different, or worse than the national rate)",
      "Aligned side-by-side facility comparisons",
    ],
  },
  {
    id: "education",
    label: "Education",
    icon: GraduationCap,
    status: "upcoming",
    headline: "Upcoming domain",
    description:
      "District-level performance data, graduation rates, enrollment, and outcome trends, resolved through the exact same semantic and execution core Healthcare runs on today.",
    features: [
      "District graduation-rate rankings",
      "Enrollment and demographic breakdowns",
      "Zero changes to the core engine to onboard",
    ],
  },
  {
    id: "finance",
    label: "Finance",
    icon: Landmark,
    status: "upcoming",
    headline: "Upcoming domain",
    description:
      "Portfolio and fiscal instrument analytics, with the same deterministic-halting, zero-hallucination guarantees applied to a completely different data domain.",
    features: [
      "Fiscal portfolio performance queries",
      "Instrument-level benchmark comparisons",
      "Same Semantic Validation Layer, new domain vocabulary only",
    ],
  },
];

export function DomainShowcase() {
  const [activeId, setActiveId] = useState(DOMAINS[0]!.id);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = DOMAINS.findIndex((domain) => domain.id === activeId);
  const active = DOMAINS[activeIndex]!;
  const Icon = active.icon;

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const delta = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (activeIndex + delta + DOMAINS.length) % DOMAINS.length;
    setActiveId(DOMAINS[nextIndex]!.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <section id="domain-sdks" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      <motion.h2
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="max-w-2xl text-2xl font-semibold tracking-tight text-foreground sm:text-3xl"
      >
        One engine, plugged into a new domain
      </motion.h2>

      <div
        role="tablist"
        aria-label="Domain SDKs"
        className="mt-10 mb-6 flex w-full flex-wrap gap-2 border-b border-border pb-px"
      >
        {DOMAINS.map((domain, index) => {
          const TabIcon = domain.icon;
          const isActive = domain.id === activeId;
          return (
            <button
              key={domain.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              role="tab"
              id={`tab-${domain.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${domain.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveId(domain.id)}
              onKeyDown={handleKeyDown}
              className={
                "relative flex min-h-11 items-center gap-2 rounded-md px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")
              }
            >
              <TabIcon className="size-4" aria-hidden="true" />
              {domain.label}
              {isActive && (
                <motion.span
                  layoutId="domain-tab-underline"
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      <motion.div key={active.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
        <SpotlightCard>
          <div
            role="tabpanel"
            id={`panel-${active.id}`}
            aria-labelledby={`tab-${active.id}`}
            tabIndex={0}
            className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[auto_1fr] lg:items-start lg:gap-10"
          >
            <div className="flex items-start gap-4 lg:flex-col lg:gap-3">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-primary">
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <div>
                <Badge variant={active.status === "active" ? "success" : "outline"}>{active.headline}</Badge>
              </div>
            </div>

            <div>
              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">{active.description}</p>
              <ul className="mt-5 flex flex-col gap-2.5">
                {active.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-foreground">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </SpotlightCard>
      </motion.div>
    </section>
  );
}
