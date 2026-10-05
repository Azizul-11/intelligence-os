import type { ClarificationOption } from "@intelligence/contracts";

/** Tier0 Task 2 (F8): reconstructs Turn 2 of the hospital-ranking clarification (HealthcareExecutionStrategy.checkPlanAmbiguity); the option's `facility_id` carries a structured `{choice, facilityId, hospitalName}` object, not a string.
 * The "lookup" choice returns the raw `facilityId`, never re-typed text (re-resolving a name need not round-trip: facility 100151 "MAYO CLINIC HOSPITAL" resolves to 030103); exported so the orchestrator and tests share it; returns `null` for non-hospital-choice options. */
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
