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
};
