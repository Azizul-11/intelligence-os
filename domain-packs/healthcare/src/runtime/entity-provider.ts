/** Resolves a phrase (hospital name, state, county, city, ownership, star rating, attribute) to Healthcare's own entity values. */
import type {
  EntityProvider,
  EntityResolutionResult,
  AmbiguousCandidate,
} from "@intelligence/domain-sdk";

import { hospitalIdentityDirectory } from "./hospital-identity-directory";
import type { HospitalIdentityRecord } from "./hospital-identity-directory";
import { HOSPITAL_FAMILIES } from "./hospital-family-directory";
import { HOSPITAL_ALIASES } from "./hospital-alias-directory";
import { COUNTIES, CITIES } from "./geographic-directory";
import type { GeographicValue } from "./geographic-directory";
import { OWNERSHIP } from "./ownership-directory";
import { STAR_RATINGS } from "./star-rating-directory";
import { BIRTHING_FRIENDLY, EMERGENCY_SERVICES, HOSPITAL_TYPES } from "./hospital-attribute-directory";

/** Presents a candidate facility as the opaque AmbiguousCandidate shape - value is the facility_id, label is a display string. */
function toAmbiguousCandidate(record: HospitalIdentityRecord): AmbiguousCandidate {
  return {
    value: record.facilityId,
    label: `${record.city}, ${record.county} County, ${record.state}`,
  };
}

// Same-name facilities are told apart by place alone. The members of a
// hospital family have different names (several can share a city), so the
// name leads the label: "<NAME>, <CITY>, <COUNTY> County, <ST>".
function toAmbiguousCandidates(records: HospitalIdentityRecord[]): AmbiguousCandidate[] {
  const named = new Set(records.map((record) => record.hospitalName)).size > 1;

  return records.map((record) => {
    const candidate = toAmbiguousCandidate(record);
    return named ? { ...candidate, label: `${record.hospitalName}, ${candidate.label}` } : candidate;
  });
}

/** Mirrors the Universal Normalizer's transformation, duplicated here to avoid a new cross-package dependency. */
export function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const STATES = new Map<string, string>([
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
  // Batch 5B-5: DC and 5 territories. Full names only for AS/MP/VI (D7: their codes collide with ordinary words).
  ["dc", "DC"],
  ["d c", "DC"],
  ["washington dc", "DC"],
  ["washington d c", "DC"],
  ["washington district of columbia", "DC"],
  ["district of columbia", "DC"],
  ["puerto rico", "PR"],
  ["guam", "GU"],
  ["u s virgin islands", "VI"],
  ["us virgin islands", "VI"],
  ["virgin islands", "VI"],
  ["american samoa", "AS"],
  ["northern mariana islands", "MP"],
]);

// Batch 2 (2.5): informal city names, exact-literal-matched only. Resolves to the NEW YORK city record alone (boroughs are separate names in the warehouse).
const INFORMAL_CITY_NAMES = new Map<string, string>([
  ["nyc", "new york"],
  ["new york city", "new york"],
]);

export class HealthcareEntityProvider
  implements EntityProvider
{
  private readonly hospitalsByName = new Map<string, HospitalIdentityRecord[]>();
  private readonly hospitalsByFamily = new Map<string, HospitalIdentityRecord[]>();

  constructor() {
    for (const record of hospitalIdentityDirectory) {
      const key = normalizeText(record.hospitalName);
      const existing = this.hospitalsByName.get(key);

      if (existing) {
        existing.push(record);
      } else {
        this.hospitalsByName.set(key, [record]);
      }

      for (const family of HOSPITAL_FAMILIES) {
        if (key.startsWith(`${family} `)) {
          this.hospitalsByFamily.set(family, [...(this.hospitalsByFamily.get(family) ?? []), record]);
        }
      }
    }

    // Batch 4: a "<operator> DBA <trade name>" facility is also asked for by its trade name.
    for (const record of hospitalIdentityDirectory) {
      const tradeName = /\s(?:dba|d\/b\/a)\s+(.+)$/i.exec(record.hospitalName)?.[1];
      const key = tradeName ? normalizeText(tradeName) : "";

      if (key && !this.hospitalsByName.has(key)) {
        this.hospitalsByName.set(key, [record]);
      }
    }

    // Batch 5C: a short name for one facility ("Cedars Sinai") is also an exact name - unless it already is one.
    // See hospital-alias-directory.ts.
    for (const [alias, officialName] of Object.entries(HOSPITAL_ALIASES)) {
      const records = this.hospitalsByName.get(officialName);

      if (records && !this.hospitalsByName.has(alias)) {
        this.hospitalsByName.set(alias, records);
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

    // Tier0 Task 5 (F12 Part A): bare ownership-phrase resolution ("non-profit hospitals"). `value` is a SQL LIKE pattern since ownership phrases map many-to-one onto raw warehouse values.
    const ownership = OWNERSHIP.get(normalizeText(phrase));

    if (ownership) {
      return {
        found: true,
        entityId: "ownership",
        value: ownership.likePattern,
        phrase,
      };
    }

    // Tier1 Task 2: bare star-rating phrase resolution ("5-star hospitals"). `value` is the exact overall_rating string (one-to-one, unlike ownership's LIKE pattern).
    const starRating = STAR_RATINGS.get(normalizeText(phrase));

    if (starRating) {
      return {
        found: true,
        entityId: "star-rating",
        value: starRating,
        phrase,
      };
    }

    // Batch 5B-4: hospital type and attribute flags, same bare-phrase resolution. A full hospital name takes precedence.
    const attributeKey = normalizeText(phrase);

    if (!this.hospitalsByName.has(attributeKey)) {
      const hospitalType = HOSPITAL_TYPES.get(attributeKey);

      if (hospitalType) {
        return { found: true, entityId: "hospital-type", value: hospitalType.likePattern, phrase };
      }

      const emergencyServices = EMERGENCY_SERVICES.get(attributeKey);

      if (emergencyServices) {
        return { found: true, entityId: "emergency-services", value: emergencyServices, phrase };
      }

      const birthingFriendly = BIRTHING_FRIENDLY.get(attributeKey);

      if (birthingFriendly) {
        return { found: true, entityId: "birthing-friendly", value: birthingFriendly, phrase };
      }
    }

    // Tier0 Task 1: bare county/city resolution ("Hospitals in Birmingham"). Collision handling: "county" suffix -> county, else city.
    const normalizedPhrase = normalizeText(phrase);
    
    // Check if phrase contains "county" suffix → resolve as county
    if (normalizedPhrase.includes(" county")) {
      const countyKey = normalizedPhrase.endsWith(" county")
        ? normalizedPhrase.slice(0, -7).trim()
        : normalizedPhrase;
      
      const countyValue = COUNTIES.get(countyKey);
      if (countyValue) {
        return {
          found: true,
          entityId: "county",
          value: countyValue.canonical,
          phrase,
        };
      }
    }
    
    // ConversationalFix follow-up: "many" is also a registered city (Many, Louisiana), which made "how MANY
    // hospitals" false-collide with it. "how many" is far more common; a genuine query still resolves via "Many, LA".
    const isQuantifierWord = normalizedPhrase === "many";

    // Check if phrase is a bare city name (or an informal name of one)
    const cityValue = isQuantifierWord ? undefined : CITIES.get(INFORMAL_CITY_NAMES.get(normalizedPhrase) ?? normalizedPhrase);
    if (cityValue) {
      return {
        found: true,
        entityId: "city",
        value: cityValue.canonical,
        phrase,
      };
    }
    
    // No county suffix and not a known city - try as bare county ("albany" meaning the county).
    const countyValue = COUNTIES.get(normalizedPhrase);
    if (countyValue) {
      return {
        found: true,
        entityId: "county",
        value: countyValue.canonical,
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

    // Batch 4: a health system's bare name ("Memorial Hermann") names its whole family, never one hospital.
    const familyMembers = this.hospitalsByFamily.get(normalizedPhrase);

    if (familyMembers) {
      return {
        found: false,
        entityId: "hospital",
        value: null,
        phrase,
        status: "ambiguous",
        candidates: toAmbiguousCandidates(familyMembers),
      };
    }

    // Qualifier wiring: PhraseExtractor already produces "<hospital name> in <qualifier>" as a candidate substring.
    // Splits on the literal " in " and narrows the name's candidates by what follows. Never guesses.
    const inIndex = phrase.toLowerCase().lastIndexOf(" in ");

    if (inIndex > 0) {
      const namePart = phrase.slice(0, inIndex);
      const rawQualifierPart = phrase.slice(inIndex + 4);
      const nameCandidates =
        this.hospitalsByName.get(normalizeText(namePart)) ?? this.hospitalsByFamily.get(normalizeText(namePart));

      if (nameCandidates && nameCandidates.length > 0) {
        // Tier0 Task 3 (Root Cause B): the raw text after " in " runs to end-of-string, so a trailing clause
        // ("...Texas overall rating") corrupts the qualifier. Bounds it to the recognized geographic prefix instead.
        const qualifierWords = rawQualifierPart.trim().split(/\s+/).filter(Boolean);
        const geoMatch = this.extractGeographicQualifierPrefix(qualifierWords);
        const boundedQualifier = geoMatch?.qualifier ?? rawQualifierPart;

        // Batch 4: several facilities share the name but none is in the place named ("Memorial Hospital in Alabama") - refuse, don't ask "which one".
        if (
          geoMatch &&
          nameCandidates.length > 1 &&
          this.filterCandidatesByQualifier(nameCandidates, boundedQualifier).length === 0
        ) {
          return {
            found: false,
            entityId: "hospital",
            value: null,
            phrase: namePart,
            status: "not_found",
          };
        }

        const directResult = this.narrowByQualifier(namePart, nameCandidates, boundedQualifier);

        // Tier0 Task 3 (brand aliasing): a contradiction against a bare name's ONE candidate may mean CMS registers
        // that brand's other locations under a suffixed name ("MAYO CLINIC HOSPITAL ROCHESTER"). See expandByBrandIfContradicted().
        const result =
          directResult.status === "not_found"
            ? (this.expandByBrandIfContradicted(namePart, nameCandidates, boundedQualifier) ?? directResult)
            : directResult;

        // A "unique" result from a PARTIAL match (leftover words after the qualifier, e.g. "...overall rating"
        // after "Texas") would span the whole input text and let Phase 8.4 swallow the leftover metric phrase.
        // Only "unique" needs this guard - a shorter substring PhraseExtractor also tries resolves it correctly.
        if (result.status === "unique" && geoMatch && !geoMatch.fullyConsumed) {
          return {
            found: false,
            entityId: null,
            value: null,
            phrase: null,
            status: "not_found",
          };
        }

        return result;
      }
    }

    // Tier0 Task 3 (safety half): without " in ", "<hospital name> <city> <state>" ("Mayo Clinic Rochester
    // Minnesota") never splits into name + qualifier, so the trailing place is silently ignored. Extends the
    // qualifier check's entry point to this phrasing, reusing narrowByQualifier()'s own contradiction safety.
    if (inIndex <= 0) {
      const prefixMatch = this.findLongestHospitalNamePrefix(phrase);

      if (prefixMatch) {
        const geoMatch = this.extractGeographicQualifierPrefix(
          prefixMatch.trailingWords,
        );

        if (geoMatch) {
          const directResult = this.narrowByQualifier(
            prefixMatch.namePart,
            prefixMatch.candidates,
            geoMatch.qualifier,
          );

          // Same brand-aliasing expansion as the " in " path above, for phrasings that omit " in ".
          const result =
            directResult.status === "not_found"
              ? (this.expandByBrandIfContradicted(
                  prefixMatch.namePart,
                  prefixMatch.candidates,
                  geoMatch.qualifier,
                ) ?? directResult)
              : directResult;

          // Same partial-match span guard as the " in " path above.
          if (result.status !== "unique" || geoMatch.fullyConsumed) {
            return result;
          }
        }
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

  /** Finds the longest prefix of `phrase` matching a registered hospital name; trailing words are returned for the caller to check against geographic tokens. */
  private findLongestHospitalNamePrefix(phrase: string): {
    namePart: string;
    candidates: HospitalIdentityRecord[];
    trailingWords: string[];
  } | null {
    const words = phrase.trim().split(/\s+/).filter(Boolean);

    for (let len = words.length - 1; len >= 1; len--) {
      const namePart = words.slice(0, len).join(" ");
      const candidates = this.hospitalsByName.get(normalizeText(namePart));

      if (candidates && candidates.length > 0) {
        return { namePart, candidates, trailingWords: words.slice(len) };
      }
    }

    return null;
  }

  /** Finds the longest recognized geographic phrase at the start of `words`. `fullyConsumed` tells the caller whether trailing words were left over - see the two call sites' "unique" guard. */
  private extractGeographicQualifierPrefix(
    words: string[],
  ): { qualifier: string; fullyConsumed: boolean } | null {
    const maxLen = Math.min(words.length, 3);

    for (let len = maxLen; len >= 1; len--) {
      const candidate = normalizeText(words.slice(0, len).join(" "));
      const countyKey = candidate.endsWith(" county")
        ? candidate.slice(0, -7).trim()
        : candidate;

      if (
        STATES.has(candidate) ||
        CITIES.has(candidate) ||
        COUNTIES.has(candidate) ||
        COUNTIES.has(countyKey)
      ) {
        return {
          qualifier: words.slice(0, len).join(" "),
          fullyConsumed: len === words.length,
        };
      }
    }

    return null;
  }

  /** Finds every facility whose official name starts with `brandPrefix` (whole-word match, so "METHODIST HOSPITAL" doesn't match "METHODIST HOSPITALS INC"). */
  private findFacilitiesByBrandPrefix(brandPrefix: string): HospitalIdentityRecord[] {
    const normalizedPrefix = normalizeText(brandPrefix);

    return hospitalIdentityDirectory.filter((record) => {
      const normalizedName = normalizeText(record.hospitalName);
      return (
        normalizedName === normalizedPrefix ||
        normalizedName.startsWith(`${normalizedPrefix} `)
      );
    });
  }

  /**
   * When a bare name matched exactly ONE candidate and the qualifier contradicts it, that candidate may be the
   * wrong one of several same-brand facilities under different official names. Re-narrows the whole brand pool by
   * the same qualifier - unique resolves, multiple matches stay "ambiguous", no match returns null (caller keeps
   * its existing "not_found"). Gated on `candidates.length === 1` so an already-ambiguous name never expands.
   */
  private expandByBrandIfContradicted(
    namePart: string,
    candidates: HospitalIdentityRecord[],
    qualifier: string,
  ): EntityResolutionResult | null {
    if (candidates.length !== 1) {
      return null;
    }

    const expanded = this.findFacilitiesByBrandPrefix(namePart);

    if (expanded.length <= 1) {
      return null;
    }

    const matched = this.filterCandidatesByQualifier(expanded, qualifier);

    if (matched.length === 1) {
      return {
        found: true,
        entityId: "hospital",
        value: matched[0]!.facilityId,
        phrase: namePart,
        status: "unique",
      };
    }

    if (matched.length > 1) {
      return {
        found: false,
        entityId: "hospital",
        value: null,
        phrase: namePart,
        status: "ambiguous",
        candidates: matched.map(toAmbiguousCandidate),
      };
    }

    return {
      found: false,
      entityId: "hospital",
      value: null,
      phrase: namePart,
      status: "not_found",
    };
  }

  /** Narrows a hospital name's candidates by an explicit qualifier (state/city/county). Healthcare-only, not part of the Universal EntityProvider interface. Never guesses. */
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

  /** Shared match predicate for narrowByQualifier()/expandByBrandIfContradicted(): state/city/county equals the qualifier, with or without trailing "County". */
  private filterCandidatesByQualifier(
    candidates: HospitalIdentityRecord[],
    qualifier: string,
  ): HospitalIdentityRecord[] {
    const normalizedQualifier = normalizeText(qualifier);
    const qualifierAsStateCode = STATES.get(normalizedQualifier);

    // Strip trailing "county" word if present for county matching
    const normalizedCountyQualifier = normalizedQualifier.endsWith(" county")
      ? normalizedQualifier.slice(0, -7).trim()
      : normalizedQualifier;

    return candidates.filter((candidate) => {
      const stateCode = candidate.state.toLowerCase();
      const city = normalizeText(candidate.city);
      const county = normalizeText(candidate.county);

      return (
        stateCode === normalizedQualifier ||
        city === normalizedQualifier ||
        county === normalizedCountyQualifier ||
        (qualifierAsStateCode !== undefined &&
          qualifierAsStateCode.toLowerCase() === stateCode)
      );
    });
  }

  private narrowByQualifier(
    hospitalName: string,
    candidates: HospitalIdentityRecord[],
    qualifier: string,
  ): EntityResolutionResult {
    const narrowed = this.filterCandidatesByQualifier(candidates, qualifier);

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
        candidates: toAmbiguousCandidates(narrowed),
      };
    }

    // Qualifier matched nothing. With multiple original candidates, stay "ambiguous" (still a real choice). With
    // exactly one, report "not_found" instead - "ambiguous" would misleadingly imply a choice that doesn't exist.
    if (candidates.length === 1) {
      return {
        found: false,
        entityId: "hospital",
        value: null,
        phrase: hospitalName,
        status: "not_found",
      };
    }

    return {
      found: false,
      entityId: "hospital",
      value: null,
      phrase: hospitalName,
      status: "ambiguous",
      candidates: toAmbiguousCandidates(candidates),
    };
  }
}