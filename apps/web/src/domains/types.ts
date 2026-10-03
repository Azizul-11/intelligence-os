export type ChatConfig = {
  placeholder: string;
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
