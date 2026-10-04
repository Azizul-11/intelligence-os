export type ChatConfig = {
  placeholder: string;
  // Shown instead of `placeholder` on phones, where the full text would be cut off.
  compactPlaceholder?: string;
  examplePrompts: readonly string[];
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
};
