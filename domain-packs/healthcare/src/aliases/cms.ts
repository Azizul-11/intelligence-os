import type { AliasDefinition } from "@intelligence/domain-sdk";

export const cmsAlias: AliasDefinition = {
  id: "cms",

  canonical: "Centers for Medicare & Medicaid Services",

  aliases: [
    "CMS",
    "Centers for Medicare & Medicaid Services",
  ],

  type: "category",

  description:
    "United States federal agency responsible for Medicare and Medicaid programs.",
};