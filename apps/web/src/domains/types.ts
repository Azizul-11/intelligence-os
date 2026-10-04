import type { ComponentType } from "react";

export type ChatConfig = {
  placeholder: string;
  // Shown instead of `placeholder` on phones, where the full text would be cut off.
  compactPlaceholder?: string;
  examplePrompts: readonly string[];
};

export type VisualizerProps = { rows: Record<string, unknown>[] };

// A domain's richer view of a result (for example one profile card), tried before the generic table.
export type ResultVisualizer = {
  id: string;
  // The canvas button says this when the visualizer applies, e.g. "View full profile".
  openLabel: string;
  matches: (rows: Record<string, unknown>[]) => boolean;
  Component: ComponentType<VisualizerProps>;
};

export type DomainConfig = {
  id: string;
  label: string;
  status: "live" | "upcoming";
  description: string;
  features: readonly string[];
  chat?: ChatConfig;
  // Optional: facility_id -> display name, for answers whose rows carry an ID but no name.
  facilityNames?: () => Promise<Record<string, string>>;
  visualizers?: readonly ResultVisualizer[];
};
