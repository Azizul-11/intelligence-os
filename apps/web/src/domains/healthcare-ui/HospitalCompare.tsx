import { useMemo, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown } from "lucide-react";

import { displayValue } from "@/modules/workspace/lib/result-format";
import { cn } from "@/shared/lib/utils";

import type { VisualizerProps } from "../types";
import { COMPARE_GROUPS, readValue, type CompareRow, type Direction, type Reading } from "./measures";

const HIDE_SCROLLBAR = "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
const LETTERS = ["A", "B", "C"];

// Tailwind needs these class names written out in full. A narrow canvas stacks the label above the values (one card per
// measure); a wider one puts the label in its own column. Three hospitals need more room before switching.
const LAYOUT = {
  2: {
    grid: "grid-cols-(--narrow) @md:grid-cols-(--wide)",
    label: "col-span-full @md:col-span-1",
    spacer: "hidden @md:block",
  },
  3: {
    grid: "grid-cols-(--narrow) @2xl:grid-cols-(--wide)",
    label: "col-span-full @2xl:col-span-1",
    spacer: "hidden @2xl:block",
  },
} as const;

type Hospital = { id: string; name: string; place: string; letter: string; row: Record<string, unknown> };

// The indexes holding the favourable value, only when 2+ values exist and they are not all equal.
function leaders(numbers: (number | null)[], direction: Direction): number[] {
  const present = numbers.filter((value): value is number => value !== null);
  if (present.length < 2 || present.every((value) => value === present[0])) return [];
  const best = direction === "lower" ? Math.min(...present) : Math.max(...present);
  return numbers.flatMap((value, index) => (value === best ? [index] : []));
}

type Evaluated = { item: CompareRow; readings: Reading[]; lead: number[]; differs: boolean };

function evaluate(item: CompareRow, hospitals: Hospital[]): Evaluated {
  const readings = hospitals.map((hospital) => readValue(hospital.row, item));
  return {
    item,
    readings,
    lead: item.direction ? leaders(readings.map((reading) => reading.num), item.direction) : [],
    differs: new Set(readings.map((reading) => reading.text)).size > 1,
  };
}

export function HospitalCompare({ rows }: VisualizerProps) {
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const hospitals: Hospital[] = useMemo(
    () =>
      rows.map((row, index) => ({
        id: String(row.facility_id),
        name: displayValue(row.hospital_name),
        place: [displayValue(row.city), String(row.state ?? "")].filter(Boolean).join(", "),
        letter: LETTERS[index] ?? String(index + 1),
        row,
      })),
    [rows],
  );

  const count = hospitals.length === 3 ? 3 : 2;
  const layout = LAYOUT[count];
  const style = { "--narrow": `repeat(${hospitals.length}, minmax(0, 1fr))`, "--wide": `minmax(9rem, 1.3fr) repeat(${hospitals.length}, minmax(0, 1fr))` } as CSSProperties;

  const groups = useMemo(
    () =>
      COMPARE_GROUPS.map((group) => {
        const evaluated = group.rows.map((item) => evaluate(item, hospitals));
        return { group, evaluated, visible: differencesOnly ? evaluated.filter((entry) => entry.differs) : evaluated };
      }).filter(({ visible }) => visible.length > 0),
    [hospitals, differencesOnly],
  );

  return (
    <div className="@container flex min-h-0 flex-1 flex-col gap-3" style={style}>
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={differencesOnly} onChange={(event) => setDifferencesOnly(event.target.checked)} className="size-4 accent-primary" />
          Show differences only
        </label>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Check className="size-3.5" aria-hidden="true" />
          Marks the lower or higher value per measure. Close values may not differ meaningfully.
        </p>
      </div>

      {/* Visual column heads; each group below carries its own screen-reader header row. */}
      <div aria-hidden="true" className={cn("grid gap-x-3 border-b border-border pb-2", layout.grid)}>
        <span className={layout.spacer} />
        {hospitals.map((hospital) => (
          <div key={hospital.id} className="min-w-0">
            <p className="flex items-start gap-1.5 text-sm font-medium leading-snug">
              <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-field text-xs">{hospital.letter}</span>
              <span className="line-clamp-3 [overflow-wrap:anywhere]" title={hospital.name}>
                {hospital.name}
              </span>
            </p>
            <p className="truncate pl-6.5 text-xs text-muted-foreground" title={hospital.place}>
              {hospital.place}
            </p>
          </div>
        ))}
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", HIDE_SCROLLBAR)}>
        {groups.length === 0 && <p className="py-6 text-sm text-muted-foreground">No differences in the reported values.</p>}

        {groups.map(({ group, evaluated, visible }, groupIndex) => {
          const wins = hospitals.map((_, index) => evaluated.filter((entry) => entry.lead.includes(index)).length);
          const ties = evaluated.filter((entry) => entry.item.direction && entry.readings.every((reading) => reading.num !== null) && !entry.differs).length;
          const compared = evaluated.some((entry) => entry.item.direction);
          const Hint = group.rows[0]?.direction === "lower" ? ArrowDown : ArrowUp;
          return (
            <details key={group.id} open={groupIndex < 2} className="group border-b border-border/60">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                <span className="flex-1 text-sm font-semibold">{group.title}</span>
                {compared && (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground" title="How many measures in this group each hospital holds the marked value on">
                    <Check className="size-3" aria-hidden="true" />
                    <span className="sr-only">Marked values:</span>
                    {hospitals.map((hospital, index) => `${hospital.letter} ${wins[index]}`).join(" · ")} · tied {ties}
                  </span>
                )}
              </summary>
              {group.hint && (
                <p className="mb-1 flex items-start gap-1.5 pl-6 text-xs text-muted-foreground">
                  {group.rows[0]?.direction && group.rows.every((item) => item.direction === group.rows[0]?.direction) && <Hint className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />}
                  <span>{group.hint}</span>
                </p>
              )}

              <div role="table" aria-label={group.title} className="pb-2">
                <div role="row" className="sr-only">
                  <span role="columnheader">Measure</span>
                  {hospitals.map((hospital) => (
                    <span key={hospital.id} role="columnheader">
                      {hospital.name}, {hospital.place}
                    </span>
                  ))}
                </div>
                {visible.map(({ item, readings, lead }) => (
                  <div key={item.key} role="row" className={cn("grid gap-x-3 gap-y-0.5 border-t border-border/40 py-2", layout.grid)}>
                    <span role="rowheader" className={cn("text-sm", layout.label)}>
                      {item.label}
                    </span>
                    {readings.map((reading, index) => (
                      <span key={hospitals[index]!.id} role="cell" className={cn("flex min-w-0 items-center gap-1 text-sm tabular-nums", reading.text ? "font-mono" : "text-muted-foreground", lead.includes(index) && "font-semibold")}>
                        {lead.includes(index) && <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />}
                        <span className="min-w-0 [overflow-wrap:anywhere]">{reading.text ?? "Not reported"}</span>
                        {lead.includes(index) && <span className="sr-only">, {item.direction === "lower" ? "lowest" : "highest"} value</span>}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </details>
          );
        })}
        <p className="mt-4 text-xs text-muted-foreground">Source: CMS Care Compare data in the warehouse. Hospitals are matched by facility ID, never by name.</p>
      </div>
    </div>
  );
}
