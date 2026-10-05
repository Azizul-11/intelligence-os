import type { ConceptDefinition } from "@intelligence/domain-sdk";

export const sepsis: ConceptDefinition = {
  id: "sepsis",
  name: "sepsis",
  displayName: "Postoperative Sepsis",
  description: "A life-threatening response to infection that can lead to organ failure. The warehouse only measures sepsis that develops after surgery (PSI_13) - not a general sepsis mortality or survival rate, which do not exist here.",
  // Batch 5B-2: PSI_13, a complication rate not mortality; lay "sepsis" maps here with a note, while "sepsis mortality/survival" stay refused (capability-catalog.ts).
  measureCodesByMetric: {
    "patient-safety-indicator": "PSI_13",
  },
};