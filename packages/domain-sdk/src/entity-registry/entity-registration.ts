/** An entity definition plus its enabled flag, submitted for registration. */
import type { EntityDefinition } from "./entity-definition";

export interface EntityRegistration {
  entity: EntityDefinition;

  enabled: boolean;
}