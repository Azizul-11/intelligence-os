import { CITIES, COUNTIES } from "./geographic-directory";
import { normalizeText, STATES } from "./entity-provider";

// The 50 states the platform answers for. The directory also lists territories (GU, PR, ...) as a "state"; a place there
// stays unresolved (and refused) exactly as before, so a territory is never derived into an answerable state filter.
const SUPPORTED_STATE_CODES = new Set(STATES.values());

export class HealthcareParameterResolver {
  /** Phase 7.5.4: the "hospital" parameter (resolved facility_id value(s)) is a Universal grouping key, not a SQL parameter; it is translated to `hospitalId` (one value)
   * or `facilityIds` (array), the names templates declare. The original "hospital" entry stays, unused but harmless. */
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

    // Batch 2 (2.3): a city/county in exactly ONE state fills a MISSING state, only when all geographic values agree; multi-state values never get here (checkPlanAmbiguity clarifies first).
    if (!("state" in parameters) && !("hospital" in parameters)) {
      const derived = this.singleStateOfGeography(parameters);

      if (derived) {
        parameters.state = derived;
      }
    }

    // Tier1 Task 5: every resolved "state" is mirrored to a "states" array (single value wrapped) so hospital-list-by-state can require "states"; "multiState" is always set.
    // With 2+ states the scalar "state" is cleared: SqlExecutor renders any array value, which would corrupt every `UPPER(state) = UPPER(:state)` clause.
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

  /** The one state every present `city`/`county` value belongs to, or undefined when none, a value is missing, any value spans several states, or that state is a territory. */
  private singleStateOfGeography(parameters: Record<string, unknown>): string | undefined {
    const states = new Set<string>();

    for (const [field, directory] of [
      ["city", CITIES],
      ["county", COUNTIES],
    ] as const) {
      const value = parameters[field];

      if (value === undefined || value === null) {
        continue;
      }

      const entry = typeof value === "string" ? directory.get(normalizeText(value)) : undefined;
      const onlyState = entry?.states.length === 1 ? entry.states[0] : undefined;

      if (onlyState === undefined) {
        return undefined;
      }

      states.add(onlyState);
    }

    const [only] = [...states];

    return states.size === 1 && only !== undefined && SUPPORTED_STATE_CODES.has(only) ? only : undefined;
  }
}
