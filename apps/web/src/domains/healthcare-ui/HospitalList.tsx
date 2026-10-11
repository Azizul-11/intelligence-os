import { useId, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, GitCompareArrows, ListFilter, Search, Siren, Star, X } from "lucide-react";

import { asNumber, columnLabel, compareCells, displayCell, displayValue, isMissing, type Row } from "@/modules/workspace/lib/result-format";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/utils";

import type { VisualizerProps } from "../types";
import { HOSPITAL_TYPE_LABELS, OWNERSHIP_LABELS, unitForMeasureCode } from "./measures";

const PAGE = 25;
const SEARCH_FROM = 12;
const NUMBER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });
const NAMES = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

// The compare view is built for two or three hospitals, and the backend refuses any other count.
const MIN_COMPARE = 2;
const MAX_COMPARE = 3;
const HOSPITAL_ENTITY = "hospital";
// Sent to the engine as is: the picked hospitals travel as facility ids, so no name is parsed from this text.
const COMPARE_QUESTION = "Compare the selected hospitals";

const PLACE_KEYS = ["city", "state", "county"];
const TAG_KEYS = ["ownership", "hospital_type", "emergency_services"];
const SET_ASIDE = new Set(["hospital_name", "facility_id", "measure_name", "measure_code", "compared_to_national", ...PLACE_KEYS, ...TAG_KEYS]);
// Coverage counts are context, not a result: they stay in a hospital's details and out of the rows.
const DETAIL_ONLY = new Set([
  "facility_mort_measure_count",
  "facility_readm_measure_count",
  "facility_safety_measure_count",
  "facility_patient_experience_measure_count",
  "patient_experience_group_measure_count",
]);
// Which per-row value leads a row, in priority order; the rest are secondary.
const HEADLINES = ["overall_rating", "score", "avg_patient_satisfaction", "excess_readmission_ratio", "safety_score", "mort_measures_better"];

const LABELS: Record<string, string> = {
  overall_rating: "Overall rating",
  score: "Score",
  compared_to_national: "Compared to national",
  hospital_type: "Hospital type",
  emergency_services: "Emergency services",
  facility_id: "Facility ID",
  measure_name: "Measure",
  measure_code: "Measure code",
  mort_measures_better: "Better than national",
  mort_measures_worse: "Worse than national",
  mort_measures_no_different: "No different from national",
  facility_mort_measure_count: "Mortality measures reported",
  avg_patient_satisfaction: "Patient satisfaction",
  patient_experience_group_measure_count: "Survey measures in the group",
  facility_patient_experience_measure_count: "Survey measures reported",
  excess_readmission_ratio: "Excess readmission ratio",
  expected_readmission_rate: "Expected readmission rate",
  predicted_readmission_rate: "Predicted readmission rate",
};
const labelFor = (key: string) => LABELS[key] ?? columnLabel(key);

const shortOwnership = (raw: string) => OWNERSHIP_LABELS[raw] ?? displayValue(raw);
const shortType = (raw: string) => HOSPITAL_TYPE_LABELS[raw] ?? displayValue(raw);

const asFlag = (value: unknown): boolean | null => (value === true || value === "true" || value === "Y" ? true : value === false || value === "false" || value === "N" ? false : null);
const emergencyLabel = (value: unknown) => (asFlag(value) === null ? "" : asFlag(value) ? "Emergency services" : "No emergency services");

function valueText(key: string, row: Row): string {
  const raw = row[key];
  if (isMissing(raw)) return "Not reported";
  const number = asNumber(raw);
  if (number === null) return displayCell(raw);
  // The unit comes from the measure catalog (the profile view states the same one).
  const unit = key === "score" && typeof row.measure_code === "string" ? unitForMeasureCode(row.measure_code) : "";
  return `${NUMBER.format(number)}${unit}`;
}

type Item = {
  id: string;
  facilityId: string;
  row: Row;
  name: string;
  // City and state in full; `place` below drops what the whole list shares.
  locale: string;
  place: string;
  facts: string[];
  emergency: string;
  rating: number | null;
  headline: string | null;
  details: { label: string; text: string; mono?: boolean }[];
};

type Analysis = { items: Item[]; context: string[]; headlineKey: string | null; headlineNumeric: boolean; directory: boolean };

function analyse(rows: Row[]): Analysis {
  const first = rows[0] ?? {};
  const keys = Object.keys(first);
  const shared = new Set(keys.filter((key) => key !== "hospital_name" && key !== "facility_id" && rows.length > 1 && rows.every((row) => String(row[key] ?? "") === String(first[key] ?? ""))));

  const context: string[] = [];
  const place = [shared.has("city") ? displayValue(first.city) : "", shared.has("state") ? String(first.state ?? "") : ""].filter(Boolean);
  if (place.length === 2) context.push(place.join(", "));
  else if (shared.has("state")) context.push(`State: ${String(first.state ?? "")}`);
  else if (place.length === 1) context.push(place[0]!);
  if (shared.has("county")) context.push(`${displayValue(first.county)} County`);
  if (shared.has("ownership") && !isMissing(first.ownership)) context.push(shortOwnership(String(first.ownership)));
  if (shared.has("hospital_type") && !isMissing(first.hospital_type)) context.push(shortType(String(first.hospital_type)));
  if (shared.has("emergency_services") && emergencyLabel(first.emergency_services)) context.push(emergencyLabel(first.emergency_services));
  if (shared.has("measure_name") && !isMissing(first.measure_name)) context.push(displayValue(first.measure_name));
  if (shared.has("compared_to_national") && !isMissing(first.compared_to_national)) context.push(`Compared to national: ${displayValue(first.compared_to_national)}`);
  for (const key of keys) {
    if (!shared.has(key) || SET_ASIDE.has(key) || DETAIL_ONLY.has(key)) continue;
    if (key === "overall_rating") context.push(`Overall rating: ${valueText(key, first)} of 5 stars`);
    else context.push(`${labelFor(key)}: ${valueText(key, first)}`);
  }

  const valueKeys = keys.filter((key) => !SET_ASIDE.has(key) && !shared.has(key) && !DETAIL_ONLY.has(key));
  const headlineKey = HEADLINES.find((key) => valueKeys.includes(key)) ?? valueKeys[0] ?? null;
  const headlineNumeric = headlineKey !== null && rows.some((row) => asNumber(row[headlineKey]) !== null);
  const extraKeys = valueKeys.filter((key) => key !== headlineKey).slice(0, 3);

  const items = rows.map((row, index): Item => {
    const facts: string[] = [];
    if (!shared.has("ownership") && !isMissing(row.ownership)) facts.push(shortOwnership(String(row.ownership)));
    if (!shared.has("hospital_type") && !isMissing(row.hospital_type)) facts.push(shortType(String(row.hospital_type)));
    if (!shared.has("compared_to_national") && !isMissing(row.compared_to_national)) facts.push(displayValue(row.compared_to_national));
    for (const key of extraKeys) facts.push(`${labelFor(key)} ${valueText(key, row)}`);

    return {
      id: `${String(row.facility_id ?? index)}-${index}`,
      facilityId: String(row.facility_id ?? ""),
      row,
      name: displayValue(row.hospital_name ?? row.facility_id ?? ""),
      locale: [displayValue(row.city), String(row.state ?? "")].filter(Boolean).join(", "),
      place: [shared.has("city") ? "" : displayValue(row.city), shared.has("state") ? "" : String(row.state ?? "")].filter(Boolean).join(", "),
      facts,
      emergency: shared.has("emergency_services") ? "" : emergencyLabel(row.emergency_services),
      rating: headlineKey === "overall_rating" ? asNumber(row.overall_rating) : null,
      headline: headlineKey && headlineKey !== "overall_rating" ? valueText(headlineKey, row) : null,
      details: keys.map((key) => {
        if (key === "overall_rating") return { label: labelFor(key), text: asNumber(row[key]) === null ? "Not rated" : `${asNumber(row[key])} of 5 stars` };
        if (key === "emergency_services") return { label: labelFor(key), text: emergencyLabel(row[key]) || "Not reported" };
        if (key === "facility_id") return { label: labelFor(key), text: String(row[key] ?? ""), mono: true };
        return { label: labelFor(key), text: valueText(key, row) };
      }),
    };
  });

  // A hospital directory (it carries type and emergency status) is not a ranking, so its rows are not numbered.
  return { items, context, headlineKey, headlineNumeric, directory: "hospital_type" in first };
}

const FILTERS: { key: string; title: string; all: string; read: (row: Row) => string }[] = [
  { key: "hospital_type", title: "Type", all: "All types", read: (row) => (isMissing(row.hospital_type) ? "" : shortType(String(row.hospital_type))) },
  { key: "ownership", title: "Ownership", all: "All ownership", read: (row) => (isMissing(row.ownership) ? "" : shortOwnership(String(row.ownership))) },
  { key: "emergency_services", title: "Emergency status", all: "Any emergency status", read: (row) => emergencyLabel(row.emergency_services) },
];

type SortId = "ranked" | "name" | "high" | "low";

function Stars({ value }: { value: number }) {
  return (
    <span aria-hidden="true" className="inline-flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={n <= value ? "size-3.5 fill-primary text-primary" : "size-3.5 text-muted-foreground/40"} />
      ))}
    </span>
  );
}

const FIELD = "min-h-11 max-w-full rounded-md border border-field bg-surface px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const BUTTON = "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";

type Chip = { id: string; label: string };

// The strip that runs a comparison: what is chosen, how to change it, and the one action; it stays in view however the list is searched, filtered or paged.
function CompareBar({ chips, busy, onRemove, onCancel, onCompare }: { chips: Chip[]; busy: boolean; onRemove: (id: string) => void; onCancel: () => void; onCompare: () => void }) {
  const count = chips.length;
  const chipsRef = useRef<HTMLUListElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const hint = busy ? "Waiting for the current answer" : count === 1 ? "Select one more" : count >= MAX_COMPARE ? "Limit reached" : "";

  // A removed chip takes focus with it, so focus moves to a neighbour (or Cancel) instead of falling to the page.
  const remove = (id: string, index: number) => {
    onRemove(id);
    requestAnimationFrame(() => {
      const buttons = Array.from(chipsRef.current?.querySelectorAll("button") ?? []);
      (buttons[Math.min(index, buttons.length - 1)] ?? cancelRef.current)?.focus();
    });
  };

  return (
    <section aria-label="Compare hospitals" className="flex shrink-0 flex-col gap-2 border-t border-primary/40 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <p aria-live="polite" className="min-w-0 flex-1 basis-40 text-sm">
          {count === 0 && !busy ? (
            <span className="font-medium">
              Choose {MIN_COMPARE} or {MAX_COMPARE} hospitals
            </span>
          ) : (
            <>
              <span className="font-medium tabular-nums">
                {count} of {MAX_COMPARE} selected
              </span>
              {hint && <span className="text-muted-foreground"> · {hint}</span>}
            </>
          )}
        </p>
        <button ref={cancelRef} type="button" onClick={onCancel} className={cn(BUTTON, "shrink-0")}>
          Cancel
        </button>
        <Button type="button" disabled={count < MIN_COMPARE || busy} onClick={onCompare} className="min-h-11 w-full px-4 sm:w-auto">
          {count < MIN_COMPARE ? "Compare" : `Compare ${count} hospitals`}
        </Button>
      </div>

      {count > 0 && (
        <ul ref={chipsRef} className="flex flex-wrap gap-2">
          {chips.map((chip, index) => (
            <li key={chip.id} className="max-w-full sm:max-w-[calc(50%-0.25rem)]">
              <button
                type="button"
                onClick={() => remove(chip.id, index)}
                title={chip.label}
                aria-label={`Remove ${chip.label} from the comparison`}
                className="inline-flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-full border border-border pr-3 pl-4 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1 truncate text-left">{chip.label}</span>
                <X className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type PickState = { picked: boolean; disabled: boolean; onToggle: (row: HTMLElement) => void };

type RowProps = {
  item: Item;
  index: number;
  region: string;
  showRank: boolean;
  headlineKey: string | null;
  headlineLabel: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onAsk: VisualizerProps["onAsk"];
  busy: boolean;
  // Set only while comparing: the row body then selects the hospital, and its details open from the chevron.
  pick?: PickState | undefined;
};

const ROW_STATES = "transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function HospitalRow({ item, index, region, showRank, headlineKey, headlineLabel, expanded, onToggleExpand, onAsk, busy, pick }: RowProps) {
  const line = [item.place, ...item.facts].filter(Boolean).join(" · ");

  const summary = (
    <>
      {showRank && <span className="w-6 shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>}

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium [overflow-wrap:anywhere]">{item.name}</span>
        {(line || item.emergency) && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {line && <span>{line}</span>}
            {item.emergency && (
              <span className="inline-flex items-center gap-1">
                <Siren className="size-3" aria-hidden="true" />
                {item.emergency}
              </span>
            )}
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
        {headlineKey === "overall_rating" ? (
          item.rating === null ? (
            <span className="text-xs text-muted-foreground">Not rated</span>
          ) : (
            <>
              <Stars value={item.rating} />
              <span className="font-mono text-sm tabular-nums">{item.rating}</span>
              <span className="sr-only"> of 5 stars</span>
            </>
          )
        ) : (
          item.headline && (
            <>
              <span className="sr-only">{headlineLabel}: </span>
              <span className={cn("font-mono text-sm tabular-nums", item.headline === "Not reported" && "font-sans text-xs text-muted-foreground")}>{item.headline}</span>
            </>
          )
        )}
      </span>
    </>
  );

  const chevron = <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", expanded && "rotate-180")} aria-hidden="true" />;

  return (
    <li className={cn("border-b border-border/60 transition-colors", pick?.picked && "bg-primary/10")}>
      {pick ? (
        <div className="flex items-start">
          <button
            type="button"
            aria-pressed={pick.picked}
            disabled={pick.disabled}
            onClick={(event) => pick.onToggle(event.currentTarget)}
            className={cn("flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3 px-1 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent", ROW_STATES)}
          >
            <span
              aria-hidden="true"
              className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors", pick.picked ? "border-primary bg-primary text-primary-foreground" : "border-field")}
            >
              {pick.picked && <Check className="size-3.5" />}
            </span>
            {summary}
          </button>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={region}
            aria-label={`${expanded ? "Hide" : "Show"} details for ${item.name}`}
            onClick={onToggleExpand}
            className={cn("flex size-11 shrink-0 cursor-pointer items-center justify-center", ROW_STATES)}
          >
            {chevron}
          </button>
        </div>
      ) : (
        <button type="button" aria-expanded={expanded} aria-controls={region} onClick={onToggleExpand} className={cn("flex min-h-11 w-full cursor-pointer items-start gap-3 px-1 py-3 text-left", ROW_STATES)}>
          {summary}
          <span className="mt-1 flex">{chevron}</span>
        </button>
      )}

      {expanded && (
        <div id={region} className="pb-4 pl-1 sm:pl-10">
          <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            {item.details.map((detail) => (
              <div key={detail.label} className="contents">
                <dt className="text-muted-foreground">{detail.label}</dt>
                <dd className={cn("[overflow-wrap:anywhere]", detail.mono && "font-mono tabular-nums")}>{detail.text}</dd>
              </div>
            ))}
          </dl>
          {onAsk && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAsk(`Tell me about ${item.name}${item.row.city && item.row.state ? ` in ${displayValue(item.row.city)}, ${String(item.row.state)}` : ""}`)}
              className={cn(BUTTON, "mt-3")}
            >
              Ask for the full profile
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function HospitalList({ rows, onAsk, onCompare, busy = false }: VisualizerProps) {
  const { items, context, headlineKey, headlineNumeric, directory } = useMemo(() => analyse(rows), [rows]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortId>("ranked");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [visible, setVisible] = useState(PAGE);
  // Compare mode is opt-in, so a plain list stays a plain list; the picks are facility ids in pick order, held apart from the rows so a search, filter or sort never drops one.
  const [comparing, setComparing] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const byFacility = useMemo(() => new Map(items.map((item) => [item.facilityId, item])), [items]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const pickedItems = picked.flatMap((id) => byFacility.get(id) ?? []);
  const chips: Chip[] = pickedItems.map((item) => ({
    id: item.facilityId,
    // Two picks can share a name (a dozen hospitals are called Memorial Hospital), so the place tells them apart.
    label: item.locale && pickedItems.some((other) => other !== item && other.name === item.name) ? `${item.name} (${item.locale})` : item.name,
  }));
  const full = picked.length >= MAX_COMPARE;
  // A comparison needs two hospitals that can be told apart by id.
  const canCompare = onCompare !== undefined && items.filter((item) => item.facilityId !== "").length >= MIN_COMPARE;

  const toggle = (facilityId: string) =>
    setPicked((current) => (current.includes(facilityId) ? current.filter((id) => id !== facilityId) : current.length < MAX_COMPARE ? [...current, facilityId] : current));

  const stopComparing = () => {
    setComparing(false);
    setPicked([]);
    toggleRef.current?.focus();
  };

  // The strip takes room from the list, so the row just picked is scrolled back into view once the strip has rendered.
  const pick = (row: HTMLElement, facilityId: string) => {
    toggle(facilityId);
    requestAnimationFrame(() => row.scrollIntoView({ block: "nearest" }));
  };

  const filterGroups = useMemo(
    () =>
      FILTERS.map((filter) => {
        const counts = new Map<string, number>();
        for (const item of items) {
          const value = filter.read(item.row);
          if (value) counts.set(value, (counts.get(value) ?? 0) + 1);
        }
        return { ...filter, options: [...counts.entries()].sort((a, b) => b[1] - a[1]) };
      }).filter((group) => group.options.length >= 2 && group.options.length <= 8),
    [items],
  );

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const matching = items.filter((item) => {
      if (needle && !`${item.name} ${item.place}`.toLowerCase().includes(needle)) return false;
      return filterGroups.every((group) => !filters[group.key] || group.read(item.row) === filters[group.key]);
    });
    if (sort === "ranked") return matching;
    const direction = sort === "low" ? 1 : -1;
    return [...matching].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      const av = headlineKey ? asNumber(a.row[headlineKey]) : null;
      const bv = headlineKey ? asNumber(b.row[headlineKey]) : null;
      if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1;
      return direction * compareCells(av, bv);
    });
  }, [items, search, sort, filters, filterGroups, headlineKey]);

  const activeFilters = Object.values(filters).filter(Boolean).length;
  const filtered = search.trim() !== "" || activeFilters > 0;
  const showRank = !directory && sort === "ranked" && !filtered;
  const headlineLabel = headlineKey ? labelFor(headlineKey) : "";
  const showHeadingRow = headlineKey !== null && items.some((item) => item.rating !== null || item.headline !== null);

  const reset = () => {
    setSearch("");
    setFilters({});
    setVisible(PAGE);
  };

  return (
    <section
      aria-label="Hospitals"
      className="@container flex min-h-0 flex-1 flex-col gap-3"
      onKeyDown={(event) => {
        // Escape leaves compare mode first; a field keeps its own Escape (clearing a search), and the canvas closes only when no mode is left to leave.
        if (event.key !== "Escape" || !comparing || (event.target as HTMLElement).closest("input, select")) return;
        event.preventDefault();
        stopComparing();
      }}
    >
      {context.length > 0 && <p className="text-sm text-muted-foreground">{context.join(" · ")}</p>}

      <div className="flex flex-wrap items-center gap-2">
        {items.length >= SEARCH_FROM && (
          <label className="relative w-full @min-[30rem]:w-auto @min-[30rem]:min-w-32 @min-[30rem]:flex-1">
            <span className="sr-only">Search by name or city</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setVisible(PAGE);
              }}
              placeholder="Name or city"
              className={cn(FIELD, "w-full pl-9")}
            />
          </label>
        )}

        <select aria-label="Sort" title={headlineNumeric ? `Sort by name or by ${headlineLabel.toLowerCase()}` : "Sort by name"} value={sort} onChange={(event) => setSort(event.target.value as SortId)} className={cn(FIELD, "min-w-24 flex-1 @min-[30rem]:flex-none")}>
          <option value="ranked">Default</option>
          <option value="name">Name A–Z</option>
          {headlineNumeric && <option value="high">High to low</option>}
          {headlineNumeric && <option value="low">Low to high</option>}
        </select>

        {filterGroups.length > 0 && (
          <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)} className={cn(BUTTON, "shrink-0", activeFilters > 0 && "border-primary")}>
            <ListFilter className="size-4" aria-hidden="true" />
            Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
          </button>
        )}

        {canCompare && (
          <button
            ref={toggleRef}
            type="button"
            aria-pressed={comparing}
            onClick={() => (comparing ? stopComparing() : setComparing(true))}
            className={cn(BUTTON, "shrink-0", comparing && "border-primary bg-primary/10")}
          >
            <GitCompareArrows className="size-4" aria-hidden="true" />
            Compare
          </button>
        )}
      </div>

      {filtersOpen && filterGroups.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {filterGroups.map((group) => (
            <select
              key={group.key}
              aria-label={group.title}
              value={filters[group.key] ?? ""}
              onChange={(event) => {
                setFilters((state) => ({ ...state, [group.key]: event.target.value }));
                setVisible(PAGE);
              }}
              className={FIELD}
            >
              <option value="">{group.all}</option>
              {group.options.map(([value, count]) => (
                <option key={value} value={value}>
                  {value} ({count})
                </option>
              ))}
            </select>
          ))}
          {activeFilters > 0 && (
            <button type="button" onClick={reset} className={BUTTON}>
              Clear
            </button>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="py-6 text-sm text-muted-foreground">
          <p>No hospitals match these filters.</p>
          <button type="button" onClick={reset} className={cn(BUTTON, "mt-2 text-foreground")}>
            Clear filters
          </button>
        </div>
      ) : (
        <>
          {showHeadingRow && (
            <div aria-hidden="true" className="flex items-center justify-between gap-3 border-b border-border px-1 pb-1.5 text-xs text-muted-foreground">
              <span>Hospital</span>
              <span className={comparing ? "pr-11" : "pr-7"}>{headlineLabel}</span>
            </div>
          )}
          <ul className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", showHeadingRow && "-mt-3")}>
            {shown.slice(0, visible).map((item, index) => {
              const isPicked = pickedSet.has(item.facilityId);
              return (
                <HospitalRow
                  key={item.id}
                  item={item}
                  index={index}
                  region={`${panelId}-${item.id}`}
                  showRank={showRank}
                  headlineKey={headlineKey}
                  headlineLabel={headlineLabel}
                  expanded={open === item.id}
                  onToggleExpand={() => setOpen(open === item.id ? null : item.id)}
                  onAsk={onAsk}
                  busy={busy}
                  pick={comparing && item.facilityId !== "" ? { picked: isPicked, disabled: full && !isPicked, onToggle: (row) => pick(row, item.facilityId) } : undefined}
                />
              );
            })}
          </ul>
        </>
      )}

      {shown.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm">
          <p className="tabular-nums text-muted-foreground" aria-live="polite">
            Showing {Math.min(visible, shown.length)} of {shown.length}
            {filtered && shown.length !== items.length ? ` (filtered from ${items.length})` : ""}
          </p>
          {shown.length > visible && (
            <button type="button" onClick={() => setVisible((count) => count + PAGE)} className={BUTTON}>
              Show {Math.min(PAGE, shown.length - visible)} more
            </button>
          )}
        </div>
      )}

      {onCompare && comparing && (
        <CompareBar
          chips={chips}
          busy={busy}
          onRemove={toggle}
          onCancel={stopComparing}
          onCompare={() =>
            onCompare({
              entityId: HOSPITAL_ENTITY,
              values: chips.map((chip) => chip.id),
              question: COMPARE_QUESTION,
              label: `Compare ${NAMES.format(chips.map((chip) => chip.label))}`,
            })
          }
        />
      )}
    </section>
  );
}
