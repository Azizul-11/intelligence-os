import type { ID } from "@intelligence/contracts";

/**
 * Describes one normalization rule.
 */
export interface NormalizationRule {
  id: ID;

  source: string;

  target: string;

  enabled: boolean;
}