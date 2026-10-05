/** Batch 4: hand-maintained health systems whose facilities share a leading name ("MEMORIAL HERMANN ..."); a matching key resolves as an identity ambiguity (user picks the campus).
 * Deliberately short, not derived (generic prefixes like "new" would match); each key prefixes 2+ official names and collides with no state/city/county (scripts/verify-batch4-ambiguity.ts). */
export const HOSPITAL_FAMILIES: readonly string[] = [
  "memorial hermann",
  "houston methodist",
  "johns hopkins",
  "duke",
  "mayo",
  "kaiser",
  "ochsner",
  "intermountain",
  "geisinger",
  "novant",
  "sentara",
  "mount sinai",
  // Batch 5C: "Sarasota Memorial" names the main hospital and its Venice campus ("SARASOTA MEMORIAL HOSPITAL - VENICE").
  "sarasota memorial",
];
