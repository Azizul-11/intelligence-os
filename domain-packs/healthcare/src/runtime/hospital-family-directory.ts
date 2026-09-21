/**
 * Batch 4: hospital-family directory.
 *
 * A health system whose facilities are registered under many different
 * official names that share a leading phrase ("MEMORIAL HERMANN KATY
 * HOSPITAL", "MEMORIAL HERMANN NORTHEAST HOSPITAL", ...). No facility is
 * named exactly "Memorial Hermann", so the exact-name lookup never
 * recognises the phrase: its words fall out of the question and the request
 * is refused, or answered as if the name had never been typed.
 *
 * Hand-maintained, exact-literal vocabulary (like ownership-directory.ts).
 * A phrase equal to one of these keys names the FAMILY: every facility whose
 * official name starts with it on a word boundary. It resolves as an
 * identity ambiguity, never as one hospital (the user picks the campus).
 *
 * Deliberately a short list and not derived from the directory: "any shared
 * name prefix" also matches generic phrases that appear in ordinary
 * questions ("hospital for", "new", "medical center", "the"). Ceiling: only
 * the systems listed here. To add one, append its normalized name; every key
 * must prefix at least two official names and collide with no state, city or
 * county (checked by scripts/verify-batch4-ambiguity.ts).
 *
 * Keys are normalized like entity-provider.ts's normalizeText() output
 * (lowercase, punctuation stripped, single spaces).
 */
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
