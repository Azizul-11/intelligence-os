export class HealthcareParameterResolver {
  /**
   * Phase 7.5.4: the "hospital" execution parameter carries the exact
   * facility_id value(s) Phase 7.5.2's identity resolution already
   * produced - it is a Universal-layer grouping key, not itself a SQL
   * parameter name. No Healthcare SQL template declares a `:hospital`
   * parameter (they declare `hospitalId` for a single facility and
   * `facilityIds` for an explicit set - see hospital-overall-rating.ts
   * and hospital-overall-rating-by-facility-ids.ts). This translates
   * the resolved value(s) into whichever of those two names already
   * matches its shape, reusing Phase 7's own `facilityIds` identity-set
   * convention rather than inventing a new one. A single value keeps
   * the existing scalar `hospitalId` name; more than one value (an
   * array, per Phase 7.5.3's representation) becomes `facilityIds`.
   * The original "hospital" entry is left in place - unused by any
   * template, but harmless.
   */
  resolve(
    entities: Record<string, unknown>,
  ): Record<string, unknown> {
    const parameters: Record<string, unknown> = { ...entities };

    if ("hospital" in parameters) {
      const hospital = parameters.hospital;

      if (Array.isArray(hospital)) {
        parameters.facilityIds = hospital;
      } else {
        parameters.hospitalId = hospital;
      }
    }

    // Tier1 Task 5 (Phase 2): every resolved "state" value - one or many
    // (Phase 7.5.3's "in" filter for 2+) - is mirrored onto a "states"
    // array parameter, always wrapping a single value into a 1-element
    // array (so `hospital-list-by-state.ts` can require "states" alone,
    // rather than a separate scalar "state", to keep its existing "at
    // least one state named" safety invariant intact for both the
    // single- and multi-state shapes). "multiState" is a plain boolean
    // flag (always set, even when no state resolved at all) a template
    // can gate a second, array-shaped WHERE clause on.
    //
    // When 2+ states resolved, the original scalar "state" entry is
    // explicitly cleared (set to undefined) rather than left as the raw
    // array: SqlExecutor's own array-parameter rendering triggers on any
    // runtime value that happens to be an array, regardless of a
    // template parameter's own declared type - left as an array, it
    // would corrupt every existing template's `UPPER(state) =
    // UPPER(:state)` equality clause (designed for exactly one value)
    // into invalid SQL. Every existing template's `:state` clause is
    // otherwise completely unaffected: for a single resolved state it
    // still receives that one scalar value exactly as before.
    if ("state" in parameters) {
      const state = parameters.state;
      const isMultiState = Array.isArray(state);

      parameters.states = isMultiState ? state : [state];
      parameters.multiState = isMultiState;

      if (isMultiState) {
        parameters.state = undefined;
      }
    } else {
      parameters.multiState = false;
    }

    return parameters;
  }
}