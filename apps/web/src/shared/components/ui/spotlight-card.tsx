import { useRef, type ReactNode, type MouseEvent } from "react";

import { cn } from "@/shared/lib/utils";

interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
}

/**
 * A card with a single-hue cursor-follow glow on hover (the pattern shared by
 * skiper-ui/vengeance-ui's hover-glow cards) — never a rainbow gradient, just
 * `--color-primary` at low opacity, tracked via CSS custom properties so the
 * glow itself never triggers a React re-render.
 */
export function SpotlightCard({ children, className }: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--spotlight-x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--spotlight-y", `${event.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      className={cn(
        "group surface-lifted shadow-panel relative overflow-hidden rounded-xl border border-border transition-colors hover:border-primary/30",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(320px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), color-mix(in oklch, var(--color-primary), transparent 88%), transparent 70%)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}
