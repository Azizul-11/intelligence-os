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

    return parameters;
  }
}