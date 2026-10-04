import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Download, GripVertical, X } from "lucide-react";

import type { ChatResponse } from "../api/orchestrator";
import { useCanvas } from "../stores/canvas.store";
import type { ChatEntry } from "../stores/chat-history.store";
import { orderColumns, parseRows, withFacilityNames, type Row } from "../lib/result-format";
import { useFacilityNames } from "../lib/facility-names";
import { ResultTable } from "./ResultTable";

const CANVAS_MIN_WIDTH = 320;
const CANVAS_MAX_SHARE = 0.7;

// CSV keeps the raw values and column keys; only the on-screen table is made friendlier.
function downloadCsv(question: string, rows: Row[]) {
  const columns = orderColumns(rows);
  const escape = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [columns.map(escape).join(","), ...rows.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${question.slice(0, 60).replace(/[^\w-]+/g, "_") || "results"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function Canvas({ entry, onClose }: { entry: ChatEntry; onClose: () => void }) {
  const asideRef = useRef<HTMLElement>(null);
  const width = useCanvas((state) => state.width);
  const setWidth = useCanvas((state) => state.setWidth);
  const names = useFacilityNames();
  const rows = useMemo(
    () => withFacilityNames(parseRows((entry.result as ChatResponse).answer), names),
    [entry.result, names],
  );
  const columnCount = Object.keys(rows[0] ?? {}).length;

  // Below lg the canvas covers the whole screen, so it behaves as a modal: the chat column behind it is made inert.
  const [overlay, setOverlay] = useState(() => window.matchMedia("(max-width: 1023px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const sync = () => setOverlay(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // Declared before the focus effect so the chat is interactive again before focus returns to it on close.
  useEffect(() => {
    const chat = asideRef.current?.previousElementSibling;
    if (!overlay || !chat) return;
    chat.setAttribute("inert", "");
    return () => chat.removeAttribute("inert");
  }, [overlay]);

  // Move focus into the canvas on open, and back to where it was on close, so Escape never strands the user.
  useEffect(() => {
    const returnTo = document.activeElement as HTMLElement | null;
    asideRef.current?.focus({ preventScroll: true });
    return () => returnTo?.focus?.();
  }, []);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // Escape belongs to a text field or an open dialog first; it only closes the canvas from anywhere else.
      if ((event.target as HTMLElement | null)?.closest("textarea, input, select, [contenteditable]") || document.querySelector("dialog[open]")) return;
      onClose();
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [onClose]);

  function currentWidth() {
    return asideRef.current?.getBoundingClientRect().width ?? CANVAS_MIN_WIDTH;
  }

  function clampWidth(px: number) {
    return Math.round(Math.min(Math.max(px, CANVAS_MIN_WIDTH), window.innerWidth * CANVAS_MAX_SHARE));
  }

  function startResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = currentWidth();
    function onMove(move: PointerEvent) {
      setWidth(clampWidth(startWidth - (move.clientX - startX)));
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function resizeWithKeys(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setWidth(clampWidth(currentWidth() + (event.key === "ArrowLeft" ? 16 : -16)));
  }

  return (
    <aside
      ref={asideRef}
      aria-label="Result canvas"
      role={overlay ? "dialog" : undefined}
      aria-modal={overlay || undefined}
      tabIndex={-1}
      style={{ "--canvas-width": width ? `${width}px` : "46%" } as CSSProperties}
      className="canvas-enter fixed inset-0 z-40 flex min-h-0 flex-col bg-surface outline-none overscroll-contain lg:relative lg:z-auto lg:my-3 lg:mr-3 lg:w-(--canvas-width) lg:shrink-0 lg:rounded-xl lg:border lg:border-border"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize canvas"
        aria-valuemin={CANVAS_MIN_WIDTH}
        aria-valuenow={width ?? undefined}
        tabIndex={0}
        title="Drag to resize"
        onPointerDown={startResize}
        onKeyDown={resizeWithKeys}
        className="group absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize rounded-full transition-colors hover:bg-primary/40 focus-visible:bg-primary/60 focus-visible:outline-none lg:block"
      >
        {/* The grip: always visible, so the edge reads as draggable before anyone hovers it. */}
        <span className="pointer-events-none absolute top-1/2 left-1/2 flex h-10 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-field bg-surface text-muted-foreground transition-colors group-hover:border-primary group-hover:text-primary group-focus-visible:border-primary group-focus-visible:text-primary">
          <GripVertical className="size-3.5" aria-hidden="true" />
        </span>
      </div>

      <header className="flex items-center gap-2 border-b border-border px-5 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entry.question}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {rows.length} results · {columnCount} columns
          </p>
        </div>
        <button
          type="button"
          onClick={() => downloadCsv(entry.question, rows)}
          disabled={rows.length === 0}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Export CSV
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close canvas"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-5">
        {rows.length > 0 ? (
          <ResultTable key={entry.id} rows={rows} />
        ) : (
          <p className="text-sm text-muted-foreground">No results to show.</p>
        )}
      </div>
    </aside>
  );
}
