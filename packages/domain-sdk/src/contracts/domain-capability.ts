/**
 * Capabilities supported by a Domain Pack.
 */
export interface DomainCapability {
  id: string;
  name: string;
  description?: string;

  enabled: boolean;
}