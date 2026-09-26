/**
 * Batch 5C: hospital alias directory.
 *
 * A well-known short name for ONE facility whose official name is longer ("Cedars Sinai" for CEDARS-SINAI MEDICAL CENTER).
 * The exact-name lookup only knows the official name, so the short name's words fell out of the question and it was refused.
 * (hospital-family-directory.ts is for a name shared by several facilities; this is for a name that means exactly one.)
 *
 * Hand-maintained, exact-literal vocabulary. Both sides are normalized like entity-provider.ts's normalizeText() output
 * (lowercase, punctuation stripped, single spaces). Each value must be the official name of exactly one facility and no
 * key may be a state, city, county or official name (checked by scripts/verify-batch5c-defects.ts).
 */
export const HOSPITAL_ALIASES: Readonly<Record<string, string>> = {
  "cedars sinai": "cedars sinai medical center",
  // 2,000 sweep (Batch E): CMS lists the flagship as "JOHNS HOPKINS HOSPITAL, THE", so the name people type missed it and
  // the "johns hopkins" family picker asked which campus (All Children's, Bayview, Howard County ... are named apart).
  "johns hopkins hospital": "johns hopkins hospital the",
  "the johns hopkins hospital": "johns hopkins hospital the",
};
