/** Phase 8.10 Layer 2: the options a clarification offers, from the engine's candidates ({value: facility_id, label: "CITY, COUNTY County, STATE"}, see entity-provider.ts).
 * A hospital-family candidate (Batch 4) leads with a name that may contain ", ", so the last three parts are the place and the rest the name. Shared by Turn 1 and a chained Turn 2. */
export function toOfferedOptions(candidates: readonly any[]) {
  return candidates.map((candidate: any) => {
    const parts = (candidate.label || "").split(", ");
    const [city, county, state] = parts.slice(-3);
    const hospitalName = parts.length > 3 ? parts.slice(0, -3).join(", ") : "";

    return {
      facility_id: candidate.value,
      hospital_name: hospitalName, // Only a hospital-family candidate carries it
      city: (city || "").trim(),
      county: (county || "").trim(),
      state: (state || "").trim(),
      displayLabel: candidate.label || `${city} - ${state}`,
    };
  });
}
