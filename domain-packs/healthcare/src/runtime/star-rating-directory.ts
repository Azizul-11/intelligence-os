/**
 * Tier1 Task 2: star-rating value directory.
 *
 * The warehouse's own `overall_rating` column has a small, fixed,
 * CMS-defined set of 5 values, confirmed live via direct DB query
 * (Tier1 Task 2 audit): "1", "2", "3", "4", "5" (plus null for
 * unrated facilities). Unlike ownership's many-to-one LIKE-pattern
 * mapping, a star-rating phrase maps to a single exact warehouse value -
 * a genuine finite, bounded, Domain-owned mapping, mirroring
 * ownership-directory.ts/geographic-directory.ts's own established
 * pattern.
 *
 * Keys are already normalized (lowercase, punctuation - including
 * hyphens - stripped to spaces, per normalizer.ts/entity-provider.ts's
 * own normalizeText(), which every lookup passes text through before
 * calling .get() here) - "5-star" and "5 star" both arrive as the
 * identical string "5 star", so only the space-separated form needs
 * registering.
 */
export const STAR_RATINGS = new Map<string, string>([
  ["5 star", "5"], ["5 stars", "5"], ["five star", "5"], ["five stars", "5"],
  ["4 star", "4"], ["4 stars", "4"], ["four star", "4"], ["four stars", "4"],
  ["3 star", "3"], ["3 stars", "3"], ["three star", "3"], ["three stars", "3"],
  ["2 star", "2"], ["2 stars", "2"], ["two star", "2"], ["two stars", "2"],
  ["1 star", "1"], ["1 stars", "1"], ["one star", "1"], ["one stars", "1"],
]);
