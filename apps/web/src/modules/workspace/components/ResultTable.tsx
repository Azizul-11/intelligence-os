import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import {
  columnLabel,
  compareCells,
  displayValue,
  isNumericColumn,
  orderColumns,
  type Row,
} from "../lib/result-format";

// Rows per canvas page. Sorting runs over every row first, then the page is cut from the sorted list.
const PAGE_SIZE = 25;

type SortState = { key: string; dir: "asc" | "desc" } | null;

export function ResultTable({ rows }: { rows: Row[] }) {
  const columns = orderColumns(rows);
  const [sort, setSort] = useState<SortState>(null);
  const [page, setPage] = useState(0);
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

  return (
    <>
      {/* Scrollbar hidden by design; focusable so the keyboard (arrow keys) can still scroll it sideways. */}
      <div
        role="region"
        aria-label="Results table"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-auto overscroll-contain rounded-md [scrollbar-width:none] [&::-webkit-scrollbar]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <table className="w-max min-w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-border">
              {columns.map((column) => {
                const active = sort?.key === column;
                const alignRight = numeric[column];
                return (
                  <th
                    key={column}
                    scope="col"
                    aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"}
                    className="p-0 font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className={cn(
                        "inline-flex min-h-11 w-full items-center gap-1 whitespace-nowrap px-3 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        alignRight ? "justify-end" : "justify-start",
                        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {columnLabel(column)}
                      {active ? (
                        sort?.dir === "asc" ? (
                          <ArrowUp className="size-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden="true" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-50" aria-hidden="true" />
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
                  <td
                    key={column}
                    className={cn("max-w-[14rem] px-3 py-2 align-top break-words sm:max-w-[22rem]", numeric[column] ? "text-right tabular-nums" : "text-left")}
                  >
                    {displayValue(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
    </>
  );
}
