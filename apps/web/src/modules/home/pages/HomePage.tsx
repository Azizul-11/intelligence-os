import { useRef, type MouseEvent } from "react";

import { LandingNav } from "../components/LandingNav";
import { HeroSection } from "../components/HeroSection";
import { InvariantsLedger } from "../components/InvariantsLedger";
import { DomainShowcase } from "../components/DomainShowcase";
import { LandingFooter } from "../components/LandingFooter";

export default function HomePage() {
  const ref = useRef<HTMLDivElement>(null);

  function handleMouseMove(event: MouseEvent<HTMLDivElement>) {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--page-glow-x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--page-glow-y", `${event.clientY - rect.top}px`);
  }

  return (
    <div ref={ref} onMouseMove={handleMouseMove} className="relative isolate min-h-dvh bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background:
            "radial-gradient(450px circle at var(--page-glow-x, 50%) var(--page-glow-y, 50%), color-mix(in oklch, var(--color-primary), transparent 80%), transparent 70%)",
        }}
      />
      <div className="relative z-10">
        <LandingNav />
        <main>
          <HeroSection />
          <InvariantsLedger />
          <DomainShowcase />
        </main>
        <LandingFooter />
      </div>
    </div>
  );
}
