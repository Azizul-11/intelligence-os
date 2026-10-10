import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import {
  columnLabel,
  compareCells,
  displayCell,
  isIdColumn,
  isMissing,
  isNumericColumn,
  orderColumns,
  planColumns,
  sharedColumns,
  type Row,
} from "../lib/result-format";

// Rows per canvas page. Sorting runs over every row first, then the page is cut from the sorted list.
const PAGE_SIZE = 25;
// Below this canvas width the rows stack as small records, so no result ever needs a sideways scroll.
const STACK_BELOW = 520;

type SortState = { key: string; dir: "asc" | "desc" } | null;

function Cell({ value }: { value: unknown }) {
  return isMissing(value) ? <span className="text-muted-foreground">Not reported</span> : <>{displayCell(value)}</>;
}

export function ResultTable({ rows }: { rows: Row[] }) {
  const all = orderColumns(rows);
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
  const [showIds, setShowIds] = useState(false);
  const [narrow, setNarrow] = useState(false);
  const frame = useRef<HTMLDivElement>(null);

  // Same value on every row: said once above the table. IDs stay out of sight unless asked for.
  const shared = useMemo(() => sharedColumns(rows).filter((column) => all.includes(column)), [rows, all.join("|")]);
  const idColumns = all.filter(isIdColumn);
  const visible = (column: string) => showIds || !isIdColumn(column);
  const kept = all.filter((column) => visible(column) && !shared.includes(column));
  // If nothing varies (or only IDs remain) the table keeps every column rather than render empty.
  const columns = kept.length > 0 ? kept : all.filter(visible).length > 0 ? all.filter(visible) : all;
  const context = kept.length > 0 ? shared.filter(visible) : [];

  useEffect(() => {
    const element = frame.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setNarrow((entry?.contentRect.width ?? STACK_BELOW) < STACK_BELOW));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const numeric = useMemo(() => Object.fromEntries(columns.map((column) => [column, isNumericColumn(rows, column)])), [rows, columns.join("|")]);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => direction * compareCells(a[sort.key], b[sort.key]));
  }, [rows, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, rows.length);
  const pageRows = sorted.slice(start, end);

  function toggleSort(column: string) {
    setPage(0);
    setSort((current) =>
      current?.key === column ? { key: column, dir: current.dir === "asc" ? "desc" : "asc" } : { key: column, dir: "asc" },
    );
  }

  const first = rows[0] ?? {};
  // A record is titled by its name column when it has one; otherwise every column is a labelled pair.
  const nameKey = planColumns(rows).nameKey;
  const title = nameKey && columns.includes(nameKey) ? nameKey : undefined;
  const rest = columns.filter((column) => column !== title);

  return (
    <div ref={frame} className="flex min-h-0 flex-1 flex-col gap-3">
      {(context.length > 0 || idColumns.length > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          {context.length > 0 && (
            <p className="text-sm text-muted-foreground">{context.map((column) => `${columnLabel(column)}: ${isMissing(first[column]) ? "Not reported" : displayCell(first[column])}`).join(" · ")}</p>
          )}
          {idColumns.length > 0 && columns.length !== idColumns.length && (
            <button
              type="button"
              aria-pressed={showIds}
              onClick={() => setShowIds((value) => !value)}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-border px-3 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-primary"
            >
              {showIds ? "Hide IDs" : "Show IDs"}
            </button>
          )}
        </div>
      )}

      {narrow ? (
        <>
          {rows.length > 1 && (
          <label className="inline-flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sort</span>
            <select
              value={sort ? `${sort.key}:${sort.dir}` : ""}
              onChange={(event) => {
                const [key, dir] = event.target.value.split(":");
                setPage(0);
                setSort(key ? { key, dir: dir === "desc" ? "desc" : "asc" } : null);
              }}
              className="min-h-11 rounded-md border border-field bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Original order</option>
              {columns.flatMap((column) => [
                <option key={`${column}:asc`} value={`${column}:asc`}>
                  {columnLabel(column)} ({numeric[column] ? "low to high" : "A to Z"})
                </option>,
                <option key={`${column}:desc`} value={`${column}:desc`}>
                  {columnLabel(column)} ({numeric[column] ? "high to low" : "Z to A"})
                </option>,
              ])}
            </select>
          </label>
          )}

          <ul aria-label="Results" className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {pageRows.map((row, index) => (
              <li key={start + index} className="border-b border-border/60 py-3">
                {title && <p className="text-sm font-medium [overflow-wrap:anywhere]"><Cell value={row[title]} /></p>}
                <dl className="mt-1 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
                  {rest.map((column) => (
                    <div key={column} className="contents">
                      <dt className="text-muted-foreground">{columnLabel(column)}</dt>
                      <dd className={cn("[overflow-wrap:anywhere]", numeric[column] && "tabular-nums")}><Cell value={row[column]} /></dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div
          role="region"
          aria-label="Results table"
          tabIndex={0}
          className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <table className="w-full min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-border">
                {columns.map((column) => {
                  const active = sort?.key === column;
                  return (
                    <th key={column} scope="col" aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"} className="p-0 font-medium">
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className={cn(
                          "group inline-flex min-h-11 w-full cursor-pointer items-center gap-1 px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          numeric[column] ? "justify-end" : "justify-start",
                          active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {columnLabel(column)}
                        {active ? (
                          sort?.dir === "asc" ? <ArrowUp className="size-3" aria-hidden="true" /> : <ArrowDown className="size-3" aria-hidden="true" />
                        ) : (
                          <ArrowUpDown className="size-3 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-100" aria-hidden="true" />
                        )}
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row, index) => (
                <tr key={start + index} className="border-b border-border/60">
                  {columns.map((column) => (
                    <td key={column} className={cn("max-w-[22rem] px-3 py-2 align-top [overflow-wrap:anywhere]", numeric[column] ? "text-right tabular-nums" : "text-left")}>
                      <Cell value={row[column]} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <nav aria-label="Result pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-sm">
          <p className="text-muted-foreground tabular-nums" aria-live="polite">
            Showing {start + 1}-{end} of {rows.length}
          </p>
          <div className="flex items-center gap-2">
            {/* aria-disabled instead of disabled, so a button that reaches its limit keeps keyboard focus. */}
            <button
              type="button"
              aria-label="Previous page"
              aria-disabled={page === 0}
              onClick={() => page > 0 && setPage(page - 1)}
              className={cn(
                "inline-flex size-11 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                page === 0 && "pointer-events-none opacity-50",
              )}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <span className="min-w-24 text-center tabular-nums">
              Page {page + 1} of {pageCount}
            </span>
            <button
              type="button"
              aria-label="Next page"
              aria-disabled={page === pageCount - 1}
              onClick={() => page < pageCount - 1 && setPage(page + 1)}
              className={cn(
                "inline-flex size-11 items-center justify-center rounded-md border border-border transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                page === pageCount - 1 && "pointer-events-none opacity-50",
              )}
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
