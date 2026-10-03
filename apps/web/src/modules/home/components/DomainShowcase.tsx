const CORE_LAYERS = ["Semantic resolution", "Query planning", "Execution", "Answerability"];

const DOMAINS = [
  {
    id: "healthcare",
    label: "Healthcare",
    status: "Live today",
    live: true,
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
    status: "Upcoming",
    live: false,
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
    status: "Upcoming",
    live: false,
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
  return (
    <section id="domain-sdks" className="scroll-mt-24 mx-auto max-w-6xl px-4 pt-24 pb-24 sm:px-6">
      <h2 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
        One engine, plugged into each domain
      </h2>

      <div className="mt-16 rounded-xl border border-border bg-surface">
        <p className="border-b border-border px-5 py-3 font-mono text-xs text-muted-foreground">shared core</p>
        <ol className="grid grid-cols-2 border-l border-t border-border md:grid-cols-4">
          {CORE_LAYERS.map((layer, index) => (
            <li key={layer} className="flex flex-col gap-2 border-r border-b border-border px-5 py-5">
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="text-sm font-medium text-foreground">{layer}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-2 grid gap-14 md:grid-cols-3 md:gap-10">
        {DOMAINS.map((domain) => (
          <div key={domain.id} className="flex flex-col gap-6">
            <div
              aria-hidden="true"
              className={"h-14 w-px " + (domain.live ? "ember-line" : "border-l border-dashed border-border")}
            />
            <div className="flex items-baseline justify-between gap-4">
              <h3 className="text-xl font-semibold tracking-tight text-foreground">{domain.label}</h3>
              <span className={"font-mono text-xs " + (domain.live ? "text-primary" : "text-muted-foreground")}>
                {domain.status}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{domain.description}</p>
            <ul className="flex flex-col gap-3">
              {domain.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm leading-relaxed text-foreground">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
