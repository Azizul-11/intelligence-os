// import type { EntityDefinition } from "@intelligence/domain-sdk";
// import { locationCategory } from "./entity-categories";
// export const stateEntity: EntityDefinition = {
//   id: "state",
//   name: "state",
//   displayName: "State",
//   category: locationCategory,
//   description: "State or territory used for regional healthcare analysis.",
// } as const;


import type { EntityDefinition } from "@intelligence/domain-sdk";

import { locationCategory } from "./entity-categories";

export const stateEntity: EntityDefinition = {
  id: "state",

  name: "state",

  displayName: "State",

  category: locationCategory,

  description:
    "State or territory used for regional healthcare analysis.",

  execution: {
    parameter: "state",
  },
} as const;