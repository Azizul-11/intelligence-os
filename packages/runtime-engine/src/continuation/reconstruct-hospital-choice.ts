import type { ClarificationOption } from "@intelligence/contracts";

/**
 * Tier0 Task 2 (F8): reconstructs Turn 2 for the hospital-ranking
 * clarification (see HealthcareExecutionStrategy.checkPlanAmbiguity) -
 * "Mayo Clinic best hospitals" style queries where a single named hospital
 * collided with a generic ranking operation. Distinct from the geographic
 * clarification's reconstruction (reconstruct-clarification.ts), which
 * appends a location qualifier to the original question text: this
 * ambiguity's two choices don't share that shape, so the offered option's
 * `facility_id` field (Universal Core's opaque candidate value, verbatim
 * from HealthcareExecutionStrategy) carries a small structured
 * `{choice, facilityId, hospitalName}` object instead of a plain string.
 *
 * The "lookup" choice deliberately returns the raw `facilityId`, never a
 * reconstructed natural-language phrase: re-typing a hospital's own
 * canonical `hospitalName` and re-resolving it through the full semantic
 * pipeline is not safe to assume round-trips to the same facility - e.g.
 * facility 100151's own stored name is "MAYO CLINIC HOSPITAL", which
 * independently (and correctly, per the qualifier-safety proofs) resolves
 * to a *different* real facility (030103) when typed as a fresh query.
 * The facility_id captured at Turn 1 is unambiguous by construction (it is
 * literally the ExecutionPlan filter value that triggered this
 * clarification); callers must look it up directly (e.g. by executing the
 * existing `hospital-overall-rating` template with `hospitalId`), not by
 * re-deriving it from text a second time.
 *
 * Exported separately (not inlined in the orchestrator's Deno-only
 * continuation service) so both the real continuation flow and this
 * package's own tests can call the exact same logic - no duplication.
 *
 * Returns `null` when `selectedOption` isn't shaped like a hospital-choice
 * candidate at all (e.g. it's a plain geographic option), so the caller
 * falls through to the existing geographic reconstruction unchanged.
 */
export type HospitalChoiceReconstruction =
  | { kind: "lookup"; facilityId: string; hospitalName: string }
  | { kind: "guidance"; message: string };

export function reconstructHospitalChoice(
  selectedOption: ClarificationOption,
): HospitalChoiceReconstruction | null {
  const choice = selectedOption.facility_id as
    | { choice?: string; facilityId?: string; hospitalName?: string }
    | undefined;

  if (!choice || typeof choice !== "object" || !choice.choice || !choice.hospitalName) {
    return null;
  }

  if (choice.choice === "similar") {
    return {
      kind: "guidance",
      message:
        `We don't have similarity ranking yet. You can compare ${choice.hospitalName} ` +
        `with another hospital explicitly (e.g. "Compare ${choice.hospitalName} and ` +
        `Cleveland Clinic"), or ask for the highest-rated hospitals in a specific state.`,
    };
  }

  if (choice.choice === "lookup" && choice.facilityId) {
    return {
      kind: "lookup",
      facilityId: choice.facilityId,
      hospitalName: choice.hospitalName,
    };
  }

  return null;
}
