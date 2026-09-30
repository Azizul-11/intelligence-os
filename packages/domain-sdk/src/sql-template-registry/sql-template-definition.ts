/** A domain-registered SQL template: its query text, parameters, and metadata flags Universal Core reads generically. */
import type { SqlTemplateParameter } from "./sql-template-parameter";
import type { SqlTemplateType } from "./sql-template-type";

export interface SqlTemplateDefinition {
  id: string;

  name: string;

  displayName: string;

  description?: string;

  template: string;

  type: SqlTemplateType;

  parameters?: SqlTemplateParameter[];

  deterministic?: boolean;

  enabled?: boolean;

  /** Phase 8.6B: true only when a zero-row result means this ONE requested entity has no data for this metric - never for a list/ranking template. */
  singleEntityRecord?: boolean;

  /** Phase 8.6C: id of a companion template that counts eligible vs. covered entities for this template's coverage. */
  coverageTemplateId?: string;
}