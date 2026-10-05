/** Bug L Beyond (Phase 2/2.1): deterministic state-abbreviation fix ("goverment hospital in CA"). Codes that collide with English words ("IN", "OR") match ALL-CAPS only (COLLIDING_UPPERCASE_ONLY);
 * others match any case. Excluded: "VA" (ownership alias for Veterans Health Administration); "ME", "OH", "ID", "MS", "MT" ("Mt Sinai") collide with words, so they need caps (found by regression test). */

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
  // Batch 5B-5 (D7): DC and two territories, uppercase only ("pr", "gu", "dc" are risky); "Washington DC" becomes one DC span in entity-provider.ts.
  // AS, MP and VI are omitted ("as", "mp", numeral "VI"); those territories match by full name only.
  ["DC", "District of Columbia"],
  ["PR", "Puerto Rico"],
  ["GU", "Guam"],
]);

// No English-word collision: matched case-INSENSITIVELY ("CA"/"Ca"/"ca"); "VA" is excluded, see file header.
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
