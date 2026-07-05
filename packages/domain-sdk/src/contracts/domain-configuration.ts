/**
 * Runtime configuration for a Domain Pack.
 */
export interface DomainConfiguration {
  enabled: boolean;

  strictMode?: boolean;

  cacheEnabled?: boolean;

  experimental?: boolean;

  defaultLocale?: string;
}