/** Maps human-readable phrases to a canonical platform value. */
import type { AliasType } from "./alias-type";

export interface AliasDefinition {
  id: string;

  canonical: string;

  aliases: string[];

  type: AliasType;

  description?: string;

  locale?: string;

  deprecated?: boolean;

  /** Tier0 Task 4 (F1): names a more specific alias this one is a generic fallback for, so candidate-consistency.ts can detect an interrupted phrase. */
  genericFallbackOf?: string;
}