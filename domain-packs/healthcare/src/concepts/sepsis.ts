import type { ConceptDefinition } from "@intelligence/domain-sdk";

export const sepsis: ConceptDefinition = {
  id: "sepsis",
  name: "sepsis",
  displayName: "Postoperative Sepsis",
  description: "A life-threatening response to infection that can lead to organ failure. The warehouse only measures sepsis that develops after surgery (PSI_13) - not a general sepsis mortality or survival rate, which do not exist here.",
  // Batch 5B-2: PSI_13, a complication rate, not a mortality rate. Casual "sepsis"/"sepsis rate" is read as this by
  // a lay-vocabulary group (with a note, since the concept underneath is narrower than the word); "sepsis mortality"
  // and "sepsis survival" stay refused (runtime/capability-catalog.ts) rather than answer the wrong measure.
  measureCodesByMetric: {
    "patient-safety-indicator": "PSI_13",
  },
};