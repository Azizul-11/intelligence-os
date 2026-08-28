import type {
  EntityProvider,
  EntityResolutionResult,
  AmbiguousCandidate,
} from "@intelligence/domain-sdk";

import { hospitalIdentityDirectory } from "./hospital-identity-directory";
import type { HospitalIdentityRecord } from "./hospital-identity-directory";

/**
 * Phase 8.3: presents a candidate facility as the Universal, opaque
 * `AmbiguousCandidate` shape - `value` is the canonical facility_id
 * (unchanged from before Phase 8.3); `label` is a human-readable
 * "<city>, <state>" string a targeted clarification can display
 * verbatim. Universal Core never interprets either field.
 */
function toAmbiguousCandidate(record: HospitalIdentityRecord): AmbiguousCandidate {
  return {
    value: record.facilityId,
    label: `${record.city}, ${record.state}`,
  };
}

/**
 * Generic text normalization (lowercase, strip punctuation, collapse
 * whitespace) - mirrors the Universal Normalizer's transformation
 * (packages/semantic/src/normalizer) so hospital-name lookups match
 * phrases exactly as they arrive after semantic normalization.
 * Duplicated here rather than imported to avoid adding a new
 * cross-package dependency for a small, domain-agnostic utility.
 */
function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STATES = new Map<string, string>([
  ["alabama", "AL"],
  ["alaska", "AK"],
  ["arizona", "AZ"],
  ["arkansas", "AR"],
  ["california", "CA"],
  ["colorado", "CO"],
  ["connecticut", "CT"],
  ["delaware", "DE"],
  ["florida", "FL"],
  ["georgia", "GA"],
  ["hawaii", "HI"],
  ["idaho", "ID"],
  ["illinois", "IL"],
  ["indiana", "IN"],
  ["iowa", "IA"],
  ["kansas", "KS"],
  ["kentucky", "KY"],
  ["louisiana", "LA"],
  ["maine", "ME"],
  ["maryland", "MD"],
  ["massachusetts", "MA"],
  ["michigan", "MI"],
  ["minnesota", "MN"],
  ["mississippi", "MS"],
  ["missouri", "MO"],
  ["montana", "MT"],
  ["nebraska", "NE"],
  ["nevada", "NV"],
  ["new hampshire", "NH"],
  ["new jersey", "NJ"],
  ["new mexico", "NM"],
  ["new york", "NY"],
  ["north carolina", "NC"],
  ["north dakota", "ND"],
  ["ohio", "OH"],
  ["oklahoma", "OK"],
  ["oregon", "OR"],
  ["pennsylvania", "PA"],
  ["rhode island", "RI"],
  ["south carolina", "SC"],
  ["south dakota", "SD"],
  ["tennessee", "TN"],
  ["texas", "TX"],
  ["utah", "UT"],
  ["vermont", "VT"],
  ["virginia", "VA"],
  ["washington", "WA"],
  ["west virginia", "WV"],
  ["wisconsin", "WI"],
  ["wyoming", "WY"],
]);

export class HealthcareEntityProvider
  implements EntityProvider
{
  private readonly hospitalsByName = new Map<string, HospitalIdentityRecord[]>();

  constructor() {
    for (const record of hospitalIdentityDirectory) {
      const key = normalizeText(record.hospitalName);
      const existing = this.hospitalsByName.get(key);

      if (existing) {
        existing.push(record);
      } else {
        this.hospitalsByName.set(key, [record]);
      }
    }
  }

  resolve(
    phrase: string,
  ): EntityResolutionResult {
   const state = STATES.get(phrase.trim().toLowerCase());

    if (state) {
      return {
        found: true,
        entityId: "state",
        value: state,
        phrase,
      };
    }

    const hospitalCandidates = this.hospitalsByName.get(normalizeText(phrase));

    if (hospitalCandidates && hospitalCandidates.length === 1) {
      return {
        found: true,
        entityId: "hospital",
        value: hospitalCandidates[0]!.facilityId,
        phrase,
        status: "unique",
      };
    }

    if (hospitalCandidates && hospitalCandidates.length > 1) {
      return {
        found: false,
        entityId: "hospital",
        value: null,
        phrase,
        status: "ambiguous",
        candidates: hospitalCandidates.map(toAmbiguousCandidate),
      };
    }

    // Qualifier wiring: Universal Core's PhraseExtractor already
    // produces the full compound phrase "<hospital name> in
    // <qualifier>" as one of its exhaustive candidate substrings (e.g.
    // "memorial hospital in texas" from "Memorial Hospital in Texas
    // overall rating") - no Universal Core change is needed to receive
    // it, since resolve(phrase: string) already accepts arbitrary
    // text. This is purely Healthcare's own interpretation of that
    // text: split on the literal word " in " (a plain string search,
    // not a regex) and, if the part before it names a known (possibly
    // ambiguous) hospital, narrow its candidates by the part after it
    // using the exact same logic resolveHospitalByQualifier() already
    // uses. Never guesses: unresolved or still-ambiguous results fall
    // through to the caller's existing "don't silently pick one"
    // handling, unchanged.
    const inIndex = phrase.toLowerCase().lastIndexOf(" in ");

    if (inIndex > 0) {
      const namePart = phrase.slice(0, inIndex);
      const qualifierPart = phrase.slice(inIndex + 4);
      const nameCandidates = this.hospitalsByName.get(normalizeText(namePart));

      if (nameCandidates && nameCandidates.length > 0) {
        return this.narrowByQualifier(namePart, nameCandidates, qualifierPart);
      }
    }

    return {
      found: false,
      entityId: null,
      value: null,
      phrase: null,
      status: "not_found",
    };
  }

  /**
   * Phase 7.5.2: narrows a hospital name's candidate set using an
   * explicit qualifier (a state name/abbreviation, or a city), when the
   * bare name resolves to more than one facility.
   *
   * This is a Healthcare-only capability, not part of the Universal
   * EntityProvider interface - Universal Core never calls this method
   * and never needs to know it exists.
   *
   * Never guesses: if the qualifier does not narrow the candidate set
   * to exactly one facility, the result remains "ambiguous" with the
   * relevant candidate set rather than arbitrarily picking one.
   */
  resolveHospitalByQualifier(
    hospitalName: string,
    qualifier: string,
  ): EntityResolutionResult {
    const candidates = this.hospitalsByName.get(normalizeText(hospitalName));

    if (!candidates || candidates.length === 0) {
      return {
        found: false,
        entityId: null,
        value: null,
        phrase: null,
        status: "not_found",
      };
    }

    return this.narrowByQualifier(hospitalName, candidates, qualifier);
  }

  /**
   * Shared narrowing logic used by both resolveHospitalByQualifier()
   * (called directly, e.g. by a future explicit-qualifier caller) and
   * resolve()'s own "<name> in <qualifier>" compound-phrase handling
   * above. Never guesses: if the qualifier does not narrow the
   * candidate set to exactly one facility, the result remains
   * "ambiguous" with the relevant candidate set rather than arbitrarily
   * picking one.
   */
  private narrowByQualifier(
    hospitalName: string,
    candidates: HospitalIdentityRecord[],
    qualifier: string,
  ): EntityResolutionResult {
    const normalizedQualifier = normalizeText(qualifier);
    const qualifierAsStateCode = STATES.get(normalizedQualifier);

    const narrowed = candidates.filter((candidate) => {
      const stateCode = candidate.state.toLowerCase();
      const city = normalizeText(candidate.city);

      return (
        stateCode === normalizedQualifier ||
        city === normalizedQualifier ||
        (qualifierAsStateCode !== undefined &&
          qualifierAsStateCode.toLowerCase() === stateCode)
      );
    });

    if (narrowed.length === 1) {
      return {
        found: true,
        entityId: "hospital",
        value: narrowed[0]!.facilityId,
        phrase: hospitalName,
        status: "unique",
      };
    }

    if (narrowed.length > 1) {
      return {
        found: false,
        entityId: "hospital",
        value: null,
        phrase: hospitalName,
        status: "ambiguous",
        candidates: narrowed.map(toAmbiguousCandidate),
      };
    }

    // The qualifier matched none of the candidates - it did not
    // legitimately narrow anything. Remain ambiguous with the original
    // candidate set rather than silently guessing or reporting
    // not_found (the name itself did resolve to real candidates).
    return {
      found: false,
      entityId: "hospital",
      value: null,
      phrase: hospitalName,
      status: "ambiguous",
      candidates: candidates.map(toAmbiguousCandidate),
    };
  }
}