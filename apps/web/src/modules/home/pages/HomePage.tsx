import { LandingNav } from "../components/LandingNav";
import { HeroSection } from "../components/HeroSection";
import { InvariantsLedger } from "../components/InvariantsLedger";
import { DomainShowcase } from "../components/DomainShowcase";
import { LaunchBand } from "../components/LaunchBand";
import { LandingFooter } from "../components/LandingFooter";

export default function HomePage() {
  return (
    <div className="min-h-dvh bg-background">
      <LandingNav />
      <main>
        <HeroSection />
        <InvariantsLedger />
        <DomainShowcase />
        <LaunchBand />
      </main>
      <LandingFooter />
    </div>
  );
}
