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

/**
 * Phase 8.3 / Phase 9 Tier0 Task 1: presents a candidate facility as
 * the Universal, opaque `AmbiguousCandidate` shape - `value` is the
 * canonical facility_id (unchanged from before Phase 8.3); `label` is
 * a human-readable "<city>, <county> County, <state>" string a targeted
 * clarification can display verbatim. Universal Core never interprets
 * either field.
 */
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

/**
 * Generic text normalization (lowercase, strip punctuation, collapse
 * whitespace) - mirrors the Universal Normalizer's transformation
 * (packages/semantic/src/normalizer) so hospital-name lookups match
 * phrases exactly as they arrive after semantic normalization.
 * Duplicated here rather than imported to avoid adding a new
 * cross-package dependency for a small, domain-agnostic utility.
 */
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
]);

// Batch 2 (2.5): informal names for a city the directory holds under its formal name. Exact literals only (matched on
// the whole normalized phrase, never a substring or a near-miss); the value is the CITIES key of the formal name.
// "Boroughs are separate city names" in the warehouse, so this resolves to the NEW YORK city record alone.
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

    // Batch 4: a facility registered as "<operator> DBA <trade name>" is asked
    // for by its trade name ("Memorial Health University Medical Center"), so
    // the trade name is also an exact name - unless it already is one.
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

    // Pre-Phase 9 Tier0 Task 5 (F12 Part A): bare ownership-phrase
    // resolution for queries like "non-profit hospitals" or
    // "government hospitals in California" - mirrors the bare
    // state/county/city resolution immediately below, reusing the same
    // "phrase alone is the filter value" shape. `value` is a SQL LIKE
    // pattern (with its own trailing "%" already included) rather than
    // a single exact warehouse value, since ownership natural-language
    // phrases are a many-to-one mapping onto the warehouse's own
    // several raw `ownership` values (see ownership-directory.ts) -
    // Universal Core never inspects this string's content, only that
    // it is the resolved value for the "ownership" execution parameter.
    const ownership = OWNERSHIP.get(normalizeText(phrase));

    if (ownership) {
      return {
        found: true,
        entityId: "ownership",
        value: ownership.likePattern,
        phrase,
      };
    }

    // Tier1 Task 2: bare star-rating phrase resolution ("5-star
    // hospitals", "hospitals with 5 stars") - mirrors the bare ownership
    // resolution immediately above, reusing the same "phrase alone is
    // the filter value" shape. `value` is the exact warehouse
    // `overall_rating` string (unlike ownership's LIKE pattern), since
    // star rating is a genuine one-to-one mapping.
    const starRating = STAR_RATINGS.get(normalizeText(phrase));

    if (starRating) {
      return {
        found: true,
        entityId: "star-rating",
        value: starRating,
        phrase,
      };
    }

    // Pre-Phase 9 Tier0 Task 1: Bare county/city resolution for queries
    // like "Best Hospital in ALBANY county" or "Hospitals in Birmingham"
    // where the phrase is the geographic value alone, not a compound
    // "<hospital name> in <qualifier>".
    //
    // Collision handling: bare "albany" exists in both CITIES and COUNTIES.
    // Resolution priority:
    // - If phrase contains " county" suffix → county
    // - Otherwise → city (prioritized)
    //
    // This enables SQL template :county and :city parameter binding for
    // ranking/listing queries with geographic scope filters.
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
    
    // Check if phrase is a bare city name (or an informal name of one)
    const cityValue = CITIES.get(INFORMAL_CITY_NAMES.get(normalizedPhrase) ?? normalizedPhrase);
    if (cityValue) {
      return {
        found: true,
        entityId: "city",
        value: cityValue.canonical,
        phrase,
      };
    }
    
    // If no county suffix and not a known city, try as bare county
    // (handles cases like "albany" when user means county but didn't
    // say "county" - less common, but still possible)
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

    // Batch 4: the bare name of a listed health system ("Memorial Hermann")
    // names its whole family of facilities - never one hospital, never
    // nothing. See hospital-family-directory.ts.
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
      const rawQualifierPart = phrase.slice(inIndex + 4);
      const nameCandidates =
        this.hospitalsByName.get(normalizeText(namePart)) ?? this.hospitalsByFamily.get(normalizeText(namePart));

      if (nameCandidates && nameCandidates.length > 0) {
        // Tier0 Task 3 (Root Cause B): the raw text after " in " runs to
        // the end of the string, so a trailing, unrelated clause (e.g.
        // "...in Texas overall rating") corrupts the qualifier with
        // words that match no city/county/state, causing narrowByQualifier
        // to find no match at all and fall back to the full, unnarrowed
        // candidate set. Bounding the qualifier to the recognized
        // geographic prefix (reusing the same CITIES/COUNTIES/STATES
        // maps this file already loads) fixes the match without
        // changing narrowByQualifier itself. Falls back to the raw,
        // unbounded text - the original behavior - when no geographic
        // prefix is recognized at all, so an already-working qualifier
        // this bounding doesn't apply to is unaffected.
        const qualifierWords = rawQualifierPart.trim().split(/\s+/).filter(Boolean);
        const geoMatch = this.extractGeographicQualifierPrefix(qualifierWords);
        const boundedQualifier = geoMatch?.qualifier ?? rawQualifierPart;

        // Batch 4: several facilities share the name, and the state/city/
        // county the user attached holds none of them ("Memorial Hospital in
        // Alabama"): there is no such hospital there. Not "which of the
        // others" - every candidate is somewhere the user did not ask about.
        // (A qualifier that is not a recognized place keeps the old
        // behaviour: it may be words of another kind.)
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

        // Tier0 Task 3 (Root Cause A, correctness half - brand aliasing):
        // a contradiction against the ONLY candidate a bare name matched
        // (e.g. "Mayo Clinic" -> 100151 alone) doesn't necessarily mean
        // the user's facility doesn't exist - CMS often registers the
        // same brand's other locations under a differently-suffixed
        // official name ("MAYO CLINIC HOSPITAL ROCHESTER"). Only
        // attempted when the bare name matched exactly one candidate
        // (never for an already-ambiguous name), so this cannot widen
        // blast radius for a name that never uniquely resolved to begin
        // with. See expandByBrandIfContradicted() for the full safety
        // reasoning.
        const result =
          directResult.status === "not_found"
            ? (this.expandByBrandIfContradicted(namePart, nameCandidates, boundedQualifier) ?? directResult)
            : directResult;

        // A "unique" result built from a PARTIAL match (leftover words
        // beyond the recognized qualifier, e.g. "...overall rating"
        // after "Texas") would be handed back to Universal Core as an
        // entity candidate spanning this whole call's input text -
        // Universal Core builds candidate spans from the full substring
        // it asked entity-provider to resolve, not just the portion
        // this function actually matched. Phase 8.4 (semantic-pipeline.ts)
        // would then treat the leftover words (a metric phrase) as if
        // they were part of the hospital's own name and suppress the
        // metric candidate entirely. "ambiguous"/"not_found" results
        // carry no such risk (Universal Core never builds a spanned
        // entity candidate for them), so only "unique" needs this guard
        // - and only when the match was partial; a shorter substring
        // PhraseExtractor also tries (without the leftover) resolves
        // this safely and correctly on its own.
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

    // Tier0 Task 3 (Root Cause A, safety half only): without the word
    // " in ", a compound "<hospital name> <city> <state>" phrase (e.g.
    // "Mayo Clinic Rochester Minnesota") is never split into name +
    // qualifier at all - the bare, shorter "Mayo Clinic" substring
    // PhraseExtractor also tries resolves on its own, unique and
    // unqualified, and the trailing "Rochester Minnesota" is silently
    // ignored. This does NOT attempt to discover a different, correctly-
    // matching facility (that requires a brand-aliasing capability,
    // explicitly out of scope - see F3_PRODUCT_DESIGN_DECISION.md): it
    // only extends the *entry point* to the qualifier check to phrasings
    // that omit " in ", reusing narrowByQualifier()'s own existing,
    // already-tested contradiction safety (candidates.length === 1 and
    // the qualifier contradicts it -> "not_found", never a silent
    // fallback) - the exact same protection "<hospital name> in
    // <qualifier>" phrasing already has. A genuine "not_found" here,
    // sharing this same hospital name and contained within this longer
    // span, is what allows Universal Core's own existing identity-
    // conflict suppression (packages/semantic/src/pipeline/
    // semantic-pipeline.ts) to discard the shorter, wrongly-surviving
    // bare-name candidate - no change needed there.
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

          // Root Cause A correctness half (brand aliasing) - same
          // expansion as the " in " path above, for phrasings that omit
          // the word " in " (e.g. "Mayo Clinic Rochester Minnesota").
          const result =
            directResult.status === "not_found"
              ? (this.expandByBrandIfContradicted(
                  prefixMatch.namePart,
                  prefixMatch.candidates,
                  geoMatch.qualifier,
                ) ?? directResult)
              : directResult;

          // Same partial-match span guard as the " in " path above: only
          // a "not_found" (the contradiction case this fix exists for)
          // is safe to return when the qualifier didn't consume every
          // trailing word - a "unique" match here would otherwise carry
          // a candidate span that swallows leftover words (e.g. a
          // metric phrase) into the hospital's own name.
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

  /**
   * Tier0 Task 3: finds the longest prefix of `phrase` (dropping trailing
   * words one at a time) that exactly matches a registered hospital name.
   * Used only when the full phrase itself didn't match (the caller's own
   * exact-match check already ran) and no " in " qualifier was found -
   * the remaining, unmatched trailing words are returned unexamined for
   * the caller to check against known geographic tokens.
   */
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

  /**
   * Tier0 Task 3: finds the longest recognized geographic phrase (a
   * city, county, or state - the same maps this file already loads for
   * Pre-Phase 9 Tier0 Task 1) starting at the beginning of `words`,
   * ignoring any further trailing words that follow it (e.g. a metric
   * phrase). `fullyConsumed` tells the caller whether the match used
   * every word in `words` or left some over - callers must not treat a
   * "unique" narrowByQualifier() result as safe to return when
   * `fullyConsumed` is false (see the two call sites' own comments for
   * why). Returns null when no prefix of `words` is a recognized
   * geographic value at all.
   */
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

  /**
   * Tier0 Task 3 Full Fix (Root Cause A, correctness half): finds every
   * registered facility whose official name starts with `brandPrefix`
   * (a name that itself already matched exactly one candidate - see
   * expandByBrandIfContradicted()'s own gating). Confirmed against the
   * live warehouse this generalizes safely across brands with real
   * multi-facility naming (Mayo Clinic, Cleveland Clinic): CMS commonly
   * registers a brand's other locations under the same name PLUS a
   * suffix ("MAYO CLINIC HOSPITAL ROCHESTER", "CLEVELAND CLINIC AVON
   * HOSPITAL"), never under an unrelated prefix - a whole-word prefix
   * match (normalizeText() guarantees a space, not a partial word,
   * follows the matched prefix) is exactly the right shape - checked
   * explicitly below (a bare `startsWith` would wrongly match, e.g.,
   * "METHODIST HOSPITAL" against "METHODIST HOSPITALS INC", since
   * "hospital" is itself a plain substring prefix of "hospitals").
   */
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
   * Tier0 Task 3 Full Fix: when a bare name matched exactly ONE
   * candidate and the user's own qualifier contradicts it (the case
   * narrowByQualifier() reports as "not_found"), that lone candidate may
   * simply be the wrong one of several same-brand facilities registered
   * under different official names. Expands the search to every
   * facility sharing that brand prefix and re-narrows by the SAME
   * qualifier: a unique match resolves, more than one MATCHING facility
   * stays honestly "ambiguous" (Rule 22's clarification, not a silent
   * pick), and no match at all reports "not_found" (returns null here
   * so the caller keeps its existing result) - never
   * narrowByQualifier()'s own zero-match fallback of surfacing the
   * WHOLE brand pool as "ambiguous" regardless of qualifier match, which
   * would be both misleading (most of the pool never matched the user's
   * qualifier at all) and unsafe: Universal Core's identity-conflict
   * suppression (packages/semantic/src/pipeline/semantic-pipeline.ts)
   * only recognizes a "not_found" result sharing the bare candidate's
   * own `phrase` as grounds to discard that shorter, wrongly-surviving
   * candidate - an "ambiguous" result here would leave it unsuppressed,
   * silently reintroducing the exact bug class this fix exists to close.
   *
   * Deliberately gated on `candidates.length === 1`: an already-
   * ambiguous bare name never reaches this expansion, so a generic word
   * that merely happens to prefix several UNRELATED hospitals (e.g.
   * "Baptist", "Methodist" - confirmed via live DB check spanning
   * dozens of independent systems) can only trigger this if that exact
   * word were ALSO, by itself, a registered official hospital name
   * resolving to exactly one facility - not the case for any brand
   * checked.
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

  /**
   * Phase 7.5.2 / Phase 9 Tier0 Task 1: narrows a hospital name's
   * candidate set using an explicit qualifier (a state name/abbreviation,
   * a city, or a county), when the bare name resolves to more than one
   * facility.
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
   *
   * Phase 9 Tier0 Task 1: now accepts county as a qualifier, with or
   * without the trailing word "County" (e.g., "Harris" matches "HARRIS",
   * and "Harris County" also matches "HARRIS").
   */
  /**
   * Shared match predicate behind narrowByQualifier() and
   * expandByBrandIfContradicted() - a candidate matches when its state,
   * city, or county (with or without a trailing "County" word) equals
   * the qualifier, directly or via a state name/abbreviation lookup.
   * Extracted so the brand-expansion path can apply the exact same
   * matching rule without inheriting narrowByQualifier()'s own
   * zero-match fallback business rules, which assume `candidates` is
   * the bare name's own resolved set - not true for an expanded brand
   * pool (see expandByBrandIfContradicted()).
   */
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

    // The qualifier matched none of the candidates - it did not
    // legitimately narrow anything.
    //
    // When more than one candidate originally existed, remain ambiguous
    // with the original candidate set rather than silently guessing or
    // reporting not_found (the name itself did resolve to more than one
    // real candidate, and the caller deserves to see all of them, even
    // though none matched the supplied qualifier).
    //
    // When exactly one candidate originally existed, there is no real
    // ambiguity to report: only one facility was ever a possibility,
    // and the user's own qualifier contradicts it. Reporting
    // "ambiguous" here would be misleading (it implies a genuine choice
    // among candidates) and - critically - risks the sole candidate
    // being silently treated as the answer downstream once this
    // "ambiguity" is later judged redundant. Report not_found instead,
    // so the request fails honestly rather than silently resolving to
    // the one candidate the user's own qualifier just contradicted.
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