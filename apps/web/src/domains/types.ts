import type { ComponentType } from "react";

export type ChatConfig = {
  placeholder: string;
  // Shown instead of `placeholder` on phones, where the full text would be cut off.
  compactPlaceholder?: string;
  examplePrompts: readonly string[];
};

// What the backend says the answer is about. Opaque to the workspace; only a domain's own components read it.
export type ResultFocus = Record<string, string | undefined>;

export type VisualizerProps = { rows: Record<string, unknown>[]; focus?: ResultFocus };

export type FocusCardProps = {
  rows: Record<string, unknown>[];
  focus: ResultFocus;
  // Set when the domain's full view can open; the card shows that action itself.
  profile?: { label: string; open: boolean; onToggle: () => void };
};

// A domain's compact card for one asked-for fact, tried before the generic ranked list.
export type FocusCard = {
  id: string;
  matches: (rows: Record<string, unknown>[], focus: ResultFocus) => boolean;
  Component: ComponentType<FocusCardProps>;
};

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
  // Optional: id -> display name, for answers whose rows carry an ID but no name.
  facilityNames?: () => Promise<Record<string, string>>;
  // Optional: adds display columns to rows that have no name column. Receives the facilityNames map once it has loaded.
  enrichRows?: (rows: Record<string, unknown>[], nameMap?: Record<string, string>) => Record<string, unknown>[];
  visualizers?: readonly ResultVisualizer[];
  focusCards?: readonly FocusCard[];
};
