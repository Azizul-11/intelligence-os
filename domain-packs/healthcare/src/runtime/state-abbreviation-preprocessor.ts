/**
 * Bug L Beyond (Phase 2, 2026-09-17; camel-case fix Phase 2.1,
 * 2026-09-17): hybrid deterministic fix for US state abbreviations
 * ("goverment hospital in CA", "government hospital in Ca",
 * "government hospital TX") - the compound "typo + abbreviation" shape
 * that remained LLM-dependent (and therefore non-deterministic across
 * the gateway's multi-vendor fallback chain) after the Bug L and Master
 * LLM Audit fixes.
 *
 * Why this splits abbreviations into two groups with two different
 * case-matching rules, rather than one blanket case-insensitive
 * addition to `entity-provider.ts`'s own `STATES` map:
 *
 * Real 2-letter US state codes collide with common English words when
 * matched lowercase and bare - "in" (Indiana) is also the preposition
 * "in", "or" (Oregon) is also the conjunction "or", "ok"/"hi"/"co"/
 * "pa"/"ma"/"de" are all also plain words or common informal usage.
 * This is exactly why `entity-provider.ts`'s `STATES` map only ever
 * contains full, spelled-out state names - a deliberate architectural
 * choice documented across this campaign, not an oversight. For this
 * COLLIDING_UPPERCASE_ONLY group, only an exact, isolated ALL-CAPS
 * token is treated as the state code ("IN") - any other casing
 * ("in", "In") is left alone, since a real user typing the actual
 * abbreviation overwhelmingly writes it in caps, while the colliding
 * ordinary word is overwhelmingly lowercase or sentence-initial
 * Title-case (e.g. "In California, hospitals report...").
 *
 * The remaining, NON_COLLIDING_CASE_INSENSITIVE group ("CA", "TX",
 * "NY", ...) has no such English-word collision risk, so it is matched
 * regardless of case ("CA"/"Ca"/"ca") - this is what closes the
 * Phase 2.1 camel-case gap ("government hospital in Ca" previously
 * fell through this fix entirely, since the original Phase 2 version
 * matched ALL 2-letter codes uppercase-only, more conservative than
 * this group of codes actually needs to be).
 *
 * "VA" is deliberately EXCLUDED from both maps despite being a real
 * state abbreviation (Virginia) - confirmed live that "VA" is also
 * this platform's own already-working ownership alias for "Veterans
 * Health Administration" (see ownership-directory.ts's "va" entry),
 * and `normalizeText()` lowercases before that lookup runs, so
 * "VA hospital" (meaning a veterans-owned hospital) is a real, already
 * working query today, in any casing. Expanding "VA"/"Va"/"va" to
 * "Virginia" here would silently break that existing capability. A
 * query that means the state of Virginia by its abbreviation remains
 * LLM-dependent, exactly as before this fix - except the unambiguous
 * "in VA" (Batch 2, IN_VA_PATTERN below).
 *
 * Phase 2.1 correction (found by this fix's own regression test, not
 * assumed safe): the first case-insensitive draft of this file put
 * "ME" and "OH" in the case-insensitive group on the assumption that
 * only the 8 codes explicitly called out as risky ("IN"/"OR"/etc.)
 * collided with ordinary English words - live-tested and confirmed
 * FALSE. "Show me hospital in CA" case-insensitively matched "me" (the
 * pronoun) against "ME" (Maine) and silently corrupted the result to a
 * mixed CA+ME response. "OH" is the equally common interjection "oh".
 * "ID" ("I'd"/identification), "MS" ("Ms." the title), and "MT" ("Mt."
 * the abbreviation for "Mount" - notably, "Mt Sinai" is a real,
 * well-known hospital brand name, making this collision concretely
 * plausible in this exact domain) were moved alongside them after the
 * same closer audit, before they could cause the identical class of
 * bug. This is exactly the lesson of the "VA" exclusion above, applied
 * more rigorously: any candidate for case-insensitive matching must be
 * checked against real English words/abbreviations, not just the
 * shortlist a prior pass happened to already flag.
 */

// Collide with a common English word or abbreviation in at least one
// non-uppercase casing - matched case-SENSITIVE, exact uppercase only.
const COLLIDING_UPPERCASE_ONLY = new Map<string, string>([
  ["IN", "Indiana"],
  ["OR", "Oregon"],
  ["OK", "Oklahoma"],
  ["HI", "Hawaii"],
  ["CO", "Colorado"],
  ["PA", "Pennsylvania"],
  ["MA", "Massachusetts"],
  ["DE", "Delaware"],
  ["ME", "Maine"], // "me" (pronoun) - confirmed live collision, see file header
  ["OH", "Ohio"], // "oh" (interjection)
  ["ID", "Idaho"], // "id"/"I'd"
  ["MS", "Mississippi"], // "Ms." (title)
  ["MT", "Montana"], // "Mt." (Mount) - e.g. "Mt Sinai" hospital brand
  // Batch 5B-5 (D7): DC and two territories, uppercase only ("pr" is public relations, "gu" and "dc" are rare but
  // not worth the risk). "Washington DC" becomes "Washington District of Columbia", which entity-provider.ts resolves
  // as one span (DC), never Washington state plus DC. AS, MP and VI are not here: "as", "mp" and the numeral "VI"
  // are ordinary text, so those territories are recognised by their full names only.
  ["DC", "District of Columbia"],
  ["PR", "Puerto Rico"],
  ["GU", "Guam"],
]);

// No meaningful English-word/abbreviation collision - matched
// case-INSENSITIVELY ("CA"/"Ca"/"ca" all resolve). "VA" is
// deliberately not in this list either - see file header comment.
const NON_COLLIDING_CASE_INSENSITIVE = new Map<string, string>([
  ["AL", "Alabama"],
  ["AK", "Alaska"],
  ["AZ", "Arizona"],
  ["AR", "Arkansas"],
  ["CA", "California"],
  ["CT", "Connecticut"],
  ["FL", "Florida"],
  ["GA", "Georgia"],
  ["IL", "Illinois"],
  ["IA", "Iowa"],
  ["KS", "Kansas"],
  ["KY", "Kentucky"],
  ["LA", "Louisiana"],
  ["MD", "Maryland"],
  ["MI", "Michigan"],
  ["MN", "Minnesota"],
  ["MO", "Missouri"],
  ["NE", "Nebraska"],
  ["NV", "Nevada"],
  ["NH", "New Hampshire"],
  ["NJ", "New Jersey"],
  ["NM", "New Mexico"],
  ["NY", "New York"],
  ["NC", "North Carolina"],
  ["ND", "North Dakota"],
  ["RI", "Rhode Island"],
  ["SC", "South Carolina"],
  ["SD", "South Dakota"],
  ["TN", "Tennessee"],
  ["TX", "Texas"],
  ["UT", "Utah"],
  ["VT", "Vermont"],
  ["WA", "Washington"],
  ["WV", "West Virginia"],
  ["WI", "Wisconsin"],
  ["WY", "Wyoming"],
]);

const HOSPITAL_CONTEXT_PATTERN = /\bhospitals?\b/i;

function buildAlternationPattern(codes: readonly string[], caseInsensitive: boolean): RegExp {
  return new RegExp(`\\b(${codes.join("|")})\\b`, caseInsensitive ? "gi" : "g");
}

const COLLIDING_PATTERN = buildAlternationPattern(
  [...COLLIDING_UPPERCASE_ONLY.keys()],
  false,
);
const NON_COLLIDING_PATTERN = buildAlternationPattern(
  [...NON_COLLIDING_CASE_INSENSITIVE.keys()],
  true,
);

// Batch 2 (2.2): "in VA" is the state. "VA" stays out of both maps above (it is also the Veterans ownership alias),
// but the preposition immediately before an ALL-CAPS "VA" leaves no doubt ("hospitals in VA"); "VA hospitals" and
// lowercase "va" are untouched. Case-sensitive on purpose, like the colliding group.
const IN_VA_PATTERN = /\b([Ii]n)\s+VA\b/g;

const HAS_LOWERCASE_PATTERN = /[a-z]/;

/**
 * Expands a US state abbreviation into its full name, but only when
 * the question also mentions "hospital"/"hospitals" (the context this
 * platform's own domain actually operates in) - a deliberately narrow,
 * additional guard alongside the case-matching rules above. Idempotent
 * and safe to call unconditionally: a question with no matching token,
 * or no "hospital(s)" mention at all, is returned unchanged.
 *
 * Batch 2 (2.2): the colliding group assumes the English word is written
 * lowercase, so its ALL-CAPS tokens must be state codes. A message with no
 * lowercase letter at all ("PLEASE SHOW ME HOSPITALS IN TEXAS!!!") breaks
 * that assumption - "ME" and "IN" are words there - so the colliding
 * group is skipped for it. The non-colliding group is safe in any casing.
 */
export function expandUppercaseStateAbbreviations(question: string): string {
  if (!HOSPITAL_CONTEXT_PATTERN.test(question)) {
    return question;
  }

  const withInVaExpanded = question.replace(IN_VA_PATTERN, "$1 Virginia");

  const withCollidingExpanded = HAS_LOWERCASE_PATTERN.test(withInVaExpanded)
    ? withInVaExpanded.replace(COLLIDING_PATTERN, (token) => {
        return COLLIDING_UPPERCASE_ONLY.get(token) ?? token;
      })
    : withInVaExpanded;

  return withCollidingExpanded.replace(NON_COLLIDING_PATTERN, (token) => {
    return NON_COLLIDING_CASE_INSENSITIVE.get(token.toUpperCase()) ?? token;
  });
}
