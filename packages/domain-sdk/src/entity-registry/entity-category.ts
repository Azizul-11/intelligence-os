/** Groups related domain entities. */
export interface EntityCategory {
  id: string;
  name: string;
  description?: string;
  /** Round 3: true only for pure geographic scope (state/county/city) - lets QueryPlanner tell a bare list request from a scope filter. */
  isGeographicScope?: boolean;
}