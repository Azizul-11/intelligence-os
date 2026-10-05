/** Batch 5C: hand-maintained short names for ONE facility (hospital-family-directory.ts covers names shared by several); keys normalized like normalizeText().
 * Each value must be one official name and no key may be a state, city, county or official name (scripts/verify-batch5c-defects.ts). */
export const HOSPITAL_ALIASES: Readonly<Record<string, string>> = {
  "cedars sinai": "cedars sinai medical center",
  // 2,000 sweep (Batch E): CMS lists the flagship as "JOHNS HOPKINS HOSPITAL, THE", so the name people type missed it and
  // the "johns hopkins" family picker asked which campus (All Children's, Bayview, Howard County ... are named apart).
  "johns hopkins hospital": "johns hopkins hospital the",
  "the johns hopkins hospital": "johns hopkins hospital the",
};
