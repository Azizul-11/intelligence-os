import { columnLabel, displayValue, planColumns, type Row } from "../lib/result-format";

// The chat card previews this many results; the canvas table always has all of them.
export const CARD_LIST_LIMIT = 10;

export function RankedList({ rows }: { rows: Row[] }) {
  const { nameKey, measureKey, rest } = planColumns(rows);
  const titleKey = nameKey ?? rest[0];
  const detailKeys = rest.filter((key) => key !== titleKey).slice(0, 2);

  return (
    <ol aria-label="Top results" className="mb-3 divide-y divide-border/60 rounded-md border border-border">
      {rows.slice(0, CARD_LIST_LIMIT).map((row, index) => (
        <li key={index} className="flex items-start gap-3 px-3 py-2">
          <span className="w-5 shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted-foreground">{index + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium">{titleKey ? displayValue(row[titleKey]) : ""}</p>
            {detailKeys.length > 0 && (
              <p className="break-words text-xs text-muted-foreground">
                {detailKeys.map((key) => displayValue(row[key])).filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          {measureKey && (
            <div className="shrink-0 text-right">
              <p className="text-sm font-medium tabular-nums">{displayValue(row[measureKey])}</p>
              <p className="text-xs text-muted-foreground">{columnLabel(measureKey)}</p>
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
