import { useId, useRef, useState, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Star } from "lucide-react";

import { asNumber, displayValue } from "@/modules/workspace/lib/result-format";
import { cn } from "@/shared/lib/utils";

import type { VisualizerProps } from "../types";
import { FAMILIES, SECTIONS, readValue, type Section } from "./measures";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "outcomes", label: "Outcomes" },
  { id: "safety", label: "Safety" },
  { id: "experience", label: "Experience" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const HIDE_SCROLLBAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

function Stars({ rating }: { rating: number }) {
  return (
    <span role="img" aria-label={`${rating} of 5 stars`} className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} aria-hidden="true" className={cn("size-4", n <= rating ? "fill-primary text-primary" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}

// A segmented bar of how many measures the data source places better, no different or worse than the national rate.
function Tally({ label, better, same, worse }: { label: string; better: number; same: number; worse: number }) {
  const parts = [
    { n: better, tone: "bg-success" },
    { n: same, tone: "bg-muted-foreground/45" },
    { n: worse, tone: "bg-destructive" },
  ];
  return (
    <div className="py-3">
      <p className="text-sm font-medium">{label}</p>
      <div aria-hidden="true" className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full">
        {parts.filter((part) => part.n > 0).map((part) => (
          <span key={part.tone} className={cn("h-full rounded-full", part.tone)} style={{ flexGrow: part.n }} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {better} better · {same} no different · {worse} worse than the national rate
      </p>
    </div>
  );
}

function Hint({ direction, children }: { direction: Section["direction"]; children: string }) {
  const Icon = direction === "lower" ? ArrowDown : ArrowUp;
  return (
    <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
      <Icon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function MeasureSection({ section, row }: { section: Section; row: Record<string, unknown> }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="py-4 first:pt-0">
      <h4 id={headingId} className="text-sm font-semibold">
        {section.title}
      </h4>
      <Hint direction={section.direction}>{section.hint}</Hint>
      <dl className="mt-2 divide-y divide-border/60">
        {section.measures.map((item) => {
          const { text } = readValue(row, item);
          return (
            <div key={item.key} className="flex items-baseline justify-between gap-4 py-2">
              <dt className="text-sm">{item.label}</dt>
              <dd className={cn("shrink-0 text-sm tabular-nums", text ? "font-mono" : "text-muted-foreground")}>{text ?? "Not reported"}</dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}

function Overview({ row }: { row: Record<string, unknown> }) {
  const rating = asNumber(row.overall_rating);
  const facts = [
    ["Hospital type", "hospital_type"],
    ["Ownership", "ownership"],
    ["County", "county"],
    ["Emergency services", "emergency_services"],
    ["Birthing friendly", "birthing_friendly"],
  ] as const;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Overall rating</p>
        {rating !== null ? (
          <span className="flex items-center gap-2 text-sm">
            <Stars rating={rating} />
            <span className="font-mono tabular-nums">{rating} of 5</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Not rated</span>
        )}
      </div>

      <section aria-labelledby="dossier-national">
        <h4 id="dossier-national" className="text-sm font-semibold">
          Compared with the national rate
        </h4>
        <div className="divide-y divide-border/60">
          {FAMILIES.map((family) => {
            const [better, same, worse, total] = ["better", "no_different", "worse"]
              .map((suffix) => asNumber(row[`${family.prefix}_measures_${suffix}`]))
              .concat(asNumber(row[`facility_${family.prefix}_measure_count`]));
            return total === null || total === 0 ? (
              <div key={family.prefix} className="flex justify-between py-3 text-sm">
                <span className="font-medium">{family.label}</span>
                <span className="text-muted-foreground">Not reported</span>
              </div>
            ) : (
              <Tally key={family.prefix} label={`${family.label} (${total} measures)`} better={better ?? 0} same={same ?? 0} worse={worse ?? 0} />
            );
          })}
        </div>
      </section>

      <dl className="divide-y divide-border/60">
        {facts.map(([label, key]) => {
          const { text } = readValue(row, { key, label, kind: key === "emergency_services" || key === "birthing_friendly" ? "flag" : "text" });
          return (
            <div key={key} className="flex justify-between gap-4 py-2">
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="text-right text-sm">{text ?? "Not reported"}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

// The tab that holds what was asked; anything else (or no focus) opens on the overview.
const TAB_BY_METRIC: Record<string, TabId> = {
  "mortality-rate": "outcomes",
  "readmission-rate": "outcomes",
  "patient-safety-indicator": "safety",
  "safety-performance": "safety",
  "patient-experience": "experience",
};

export function HospitalDossier({ rows, focus }: VisualizerProps) {
  const row = rows[0]!;
  const [tab, setTab] = useState<TabId>((focus?.metric ? TAB_BY_METRIC[focus.metric] : undefined) ?? "overview");
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const baseId = useId();

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = TABS.findIndex((item) => item.id === tab);
    const next =
      event.key === "ArrowRight" ? (index + 1) % TABS.length : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault();
    const target = TABS[next]!.id;
    setTab(target);
    tabRefs.current[target]?.focus();
  }

  const place = [displayValue(row.city), String(row.state ?? "")].filter(Boolean).join(", ");

  return (
    <div className="@container flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h3 className="text-lg font-semibold leading-snug [overflow-wrap:anywhere]">{displayValue(row.hospital_name)}</h3>
        <p className="text-sm text-muted-foreground">{[place, displayValue(row.hospital_type)].filter(Boolean).join(" · ")}</p>
      </div>

      <div role="tablist" aria-label="Hospital profile sections" onKeyDown={onKeyDown} className={cn("flex gap-1 overflow-x-auto border-b border-border", HIDE_SCROLLBAR)}>
        {TABS.map((item) => (
          <button
            key={item.id}
            ref={(el) => {
              tabRefs.current[item.id] = el;
            }}
            id={`${baseId}-${item.id}-tab`}
            role="tab"
            type="button"
            aria-selected={tab === item.id}
            aria-controls={`${baseId}-panel`}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            className={cn(
              "-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-1.5 text-sm transition-colors @sm:px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              tab === item.id ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}-tab`} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", HIDE_SCROLLBAR)}>
        {tab === "overview" ? (
          <Overview row={row} />
        ) : (
          <div className="divide-y divide-border/60">
            {SECTIONS.filter((section) => section.tab === tab).map((section) => (
              <MeasureSection key={section.id} section={section} row={row} />
            ))}
          </div>
        )}
        <p className="mt-6 text-xs text-muted-foreground">Source: CMS Care Compare data in the warehouse. “Not reported” means the source has no value for this hospital.</p>
      </div>
    </div>
  );
}
