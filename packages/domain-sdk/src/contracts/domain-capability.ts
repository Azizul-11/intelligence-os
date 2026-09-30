/** A capability a Domain Pack declares support for. */
export interface DomainCapability {
  id: string;
  name: string;
  description?: string;

  enabled: boolean;
}