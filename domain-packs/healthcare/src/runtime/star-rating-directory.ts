/** Tier1 Task 2: star-rating phrases map to a single exact `overall_rating` value ("1".."5"), unlike ownership's LIKE patterns.
 * Keys are already normalized (hyphens become spaces), so "5-star" and "5 star" both arrive as "5 star". */
export const STAR_RATINGS = new Map<string, string>([
  ["5 star", "5"], ["5 stars", "5"], ["five star", "5"], ["five stars", "5"],
  ["4 star", "4"], ["4 stars", "4"], ["four star", "4"], ["four stars", "4"],
  ["3 star", "3"], ["3 stars", "3"], ["three star", "3"], ["three stars", "3"],
  ["2 star", "2"], ["2 stars", "2"], ["two star", "2"], ["two stars", "2"],
  ["1 star", "1"], ["1 stars", "1"], ["one star", "1"], ["one stars", "1"],
]);
