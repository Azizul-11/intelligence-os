/**
 * Groups related domain entities.
 */
export interface EntityCategory {
  id: string;
  name: string;
  description?: string;
  /**
   * PrePhase 9.5 Round 3: true only for categories that represent pure
   * geographic scope (state/county/city, "hospitals IN <place>") - the
   * one generic, domain-agnostic signal `QueryPlanner.createPlan()`
   * needs to tell "a bare geographic list request" (must stay a plain
   * list - e.g. "hospitals in Texas") apart from "a non-geographic scope
   * filter alongside a list-shaped metric" (should default to the
   * domain's own ranked view instead - e.g. "non-profit hospitals in
   * California", which a plain state list silently over-returns/crowds
   * out). Never inspected for any other purpose; omitted (not merely
   * false) for every non-geographic category.
   */
  isGeographicScope?: boolean;
}