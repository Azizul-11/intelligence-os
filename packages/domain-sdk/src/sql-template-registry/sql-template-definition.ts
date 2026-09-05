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

  /**
   * Phase 8.6B: true only when a successful, empty (rowCount === 0)
   * result from THIS template means the single requested entity
   * genuinely has no underlying data for this metric - not merely that
   * the template accepts an entity parameter. A template that returns
   * a list/enumeration of matching entities (a state/ownership list,
   * any ranking, an explicit multi-entity fetch) must never set this,
   * even though it may also filter by an entity value - for those
   * shapes, zero rows is an ordinary, legitimate empty result, never
   * evidence of missing data. Domain-declared; the runtime reads it
   * generically and never sets it itself. Absent (not merely false) on
   * every template unless a Domain SDK author has explicitly reasoned
   * through this exact distinction for that specific template.
   */
  singleEntityRecord?: boolean;

  /**
   * Phase 8.6C: the id of a companion template that measures this
   * template's own population coverage - i.e. how many entities
   * satisfy this request's non-metric scope (`eligibleCount`), and how
   * many of those also have this metric's value present
   * (`coveredCount`). Domain-declared and optional; absent on every
   * template unless a Domain SDK author has written a companion
   * template whose own query correctly counts distinct entities (not
   * raw rows - a metric backed by a multi-row detail table must count
   * distinct entities with at least one row, never every row). The
   * companion template must never apply LIMIT/ORDER BY and must never
   * apply this metric's own presence condition to the eligible count -
   * only to the covered count. Universal Core only ever resolves and
   * executes the id this field names; it never inspects or constructs
   * the companion template's own SQL.
   */
  coverageTemplateId?: string;
}