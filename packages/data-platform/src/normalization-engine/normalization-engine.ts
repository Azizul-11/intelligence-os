import type { NormalizationContext } from "./normalization-context";
import type { NormalizationResult } from "./normalization-result";

/**
 * Normalization Engine contract.
 */
export interface NormalizationEngine {
  normalizeFields(
    context: NormalizationContext,
  ): Promise<NormalizationResult>;

  normalizeAliases(
    context: NormalizationContext,
  ): Promise<NormalizationResult>;

  normalizeValues(
    context: NormalizationContext,
  ): Promise<NormalizationResult>;

  normalize(
    context: NormalizationContext,
  ): Promise<NormalizationResult>;
}