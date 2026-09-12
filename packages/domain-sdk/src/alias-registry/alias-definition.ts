import type { AliasType } from "./alias-type";

export interface AliasDefinition {
  /**
   * Unique alias identifier.
   */
  id: string;

  /**
   * Canonical platform value.
   */
  canonical: string;

  /**
   * Human-readable aliases.
   */
  aliases: string[];

  /**
   * Alias category.
   */
  type: AliasType;

  /**
   * Optional description.
   */
  description?: string;

  /**
   * Optional locale.
   */
  locale?: string;

  /**
   * Indicates whether the alias is deprecated.
   */
  deprecated?: boolean;

  /**
   * Tier0 Task 4 (F1): declares this alias as a generic fallback for a
   * more specific alias, by that alias's own `canonical` value - e.g.
   * a domain's bare "average" -> "median" alias may declare
   * `genericFallbackOf: "national-average"` when "national average" is
   * a registered, more specific alias whose own words are a superset of
   * this one's.
   *
   * Consumed generically (see
   * packages/query-planner/src/candidate-consistency.ts's
   * `detectSubsumedBenchmarkRisk`): when this alias resolves as a
   * candidate but the more specific alias it names does NOT - despite
   * every word of that more specific alias's own registered phrase
   * being present somewhere in the query - the query is refused for
   * clarification rather than silently answered with this generic
   * alias's meaning. `PhraseExtractor` only matches contiguous spans,
   * so a word inserted between the specific alias's own words (e.g.
   * "national mortality average") breaks it silently; this field lets
   * a Domain declare, as plain data, which generic alias might be
   * standing in for which specific one when that happens - Universal
   * Core never hardcodes which alias this could apply to.
   *
   * Optional and narrow: a Domain that declares no such relationship
   * (or a Domain SDK with no benchmark vocabulary at all) is completely
   * unaffected.
   */
  genericFallbackOf?: string;
}