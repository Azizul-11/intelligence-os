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
}