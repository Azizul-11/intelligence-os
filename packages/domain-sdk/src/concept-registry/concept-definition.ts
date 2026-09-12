/**
 * Describes a semantic concept exposed by a Domain Pack.
 */
export interface ConceptDefinition {
  id: string;

  name: string;

  displayName: string;

  description?: string;

  /**
   * Optional map from a resolved metric's own canonical id to the
   * Domain-owned identifier this concept corresponds to for that
   * specific metric (e.g. Healthcare's "acute-myocardial-infarction"
   * concept maps `"mortality-rate"` -> `"MORT_30_AMI"` and
   * `"readmission-rate"` -> `"READM-30-AMI-HRRP"` - two different
   * per-condition measure codes, one per metric, since mortality and
   * readmission are tracked in separate warehouse detail tables).
   * Universal Core (`ExecutionPlanMapper.buildFilters()`) only ever
   * reads this generically to build an opaque `measureCode` filter when
   * both a concept and a matching metric are resolved together; it
   * never inspects or hardcodes what any key or value here means.
   */
  measureCodesByMetric?: Record<string, string>;
}