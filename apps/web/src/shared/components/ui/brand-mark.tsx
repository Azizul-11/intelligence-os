export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id="brand-mark-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--brand-a)" }} />
          <stop offset="1" style={{ stopColor: "var(--brand-b)" }} />
        </linearGradient>
      </defs>
      <path
        d="M16 2 28.12 9v14L16 30 3.88 23V9z"
        fill="url(#brand-mark-fill)"
        stroke="url(#brand-mark-fill)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M16 10 10.5 20h11z"
        fill="none"
        stroke="var(--brand-ink)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="10" r="2.3" fill="var(--brand-ink)" />
      <circle cx="10.5" cy="20" r="2.3" fill="var(--brand-ink)" />
      <circle cx="21.5" cy="20" r="2.3" fill="var(--brand-ink)" />
    </svg>
  );
}
