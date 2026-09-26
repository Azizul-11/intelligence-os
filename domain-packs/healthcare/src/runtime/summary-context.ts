/**
 * Phase 3.5 (UX hardening): the prepared context an executive summary is written from. The summary model used to get
 * the raw question and up to 20 raw rows (`facility_id`, `measure_code`, snake_case keys) and nothing else, so it
 * could only recite rows ("X has 1.8, Y has 2, ..."), miscounted anything longer than 20 rows, never mentioned the
 * filters the rows already satisfy, and could not state a count or a range without the grounding check rejecting it.
 *
 * Everything here is deterministic and read from what the answer already carries (the rows and the parameters the
 * engine executed with). The model receives:
 *  - `measure`: what the value column means, its unit and which direction is better;
 *  - `filters`: the applied filters in plain words;
 *  - `scope`: how many hospitals are shown and whether the list is a ranking;
 *  - `facts`: precomputed numbers (leader, range, ties, how many beat the national rate, state spread) - the only
 *    derived numbers it may state; the orchestrator's grounding check accepts exactly these (`summaryFactNumbers`);
 *  - `rows`: at most 10 (a ranking) or 20 (a list) rows with plain labels and title-cased names, no ids or codes.
 */

import { concepts } from "../concepts";
import { healthcareMetrics } from "../metrics";
import { STATE_NAMES_BY_CODE } from "./execution-strategy";
import { OWNERSHIP } from "./ownership-directory";
import { HOSPITAL_TYPES } from "./hospital-attribute-directory";

type Row = Readonly<Record<string, unknown>>;

export interface SummaryMeasure {
  name: string;
  unit?: string;
  better: "lower" | "higher";
  /** What the national-comparison column says, when the rows carry one. */
  benchmark?: string;
}

export interface SummaryContext {
  kind: "ranking" | "list" | "profile" | "comparison" | "table" | "grouped";
  measure?: SummaryMeasure;
  filters: string[];
  scope: string;
  facts: Record<string, unknown>;
  rows: Record<string, string | number>[];
  /** Lines already shown to the user above the summary (interpretation, tie or D11 notes): never restated. */
  alreadyShown: string[];
}

/** Short uppercase tokens that are acronyms, kept as written when a CMS name is title-cased. */
const ACRONYMS = new Set([
  "VA", "UT", "NYU", "UC", "UCLA", "UCSF", "UCSD", "LLC", "II", "III", "IV", "DC", "CHI", "HCA", "AHN", "UPMC", "OSF", "SSM",
  "MUSC", "UAB", "UNC", "UVA", "USC", "LSU", "UK", "UF", "SLU", "OU", "OHSU", "JFK", "LBJ", "HSHS", "WVU", "UW", "UI", "ECU",
  "MD", "PA", "NY", "TX", "CA", "FL", "OH", "NF", "AFB", "USA", "US", "HS", "LIJ", "NS",
]);

function titleCase(value: unknown): string {
  const text = String(value ?? "").trim();

  if (text !== text.toUpperCase()) {
    return text;
  }

  return text
    .toLowerCase()
    .replace(/[a-z0-9']+/g, (word) => {
      const upper = word.toUpperCase();
      if (ACRONYMS.has(upper) || !/[aeiouy]/.test(word)) {
        return upper;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .replace(/\s+/g, " ");
}

const numberOf = (value: unknown): number | undefined => {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(number) ? number : undefined;
};

/** Which measure a row's `measure_code` belongs to, and whether lower is better for it. */
function measureOfCode(code: string): { conceptName: string; metricId: string } | undefined {
  for (const concept of concepts) {
    for (const [metricId, measureCode] of Object.entries(concept.measureCodesByMetric ?? {})) {
      if (measureCode === code) {
        return { conceptName: concept.displayName, metricId };
      }
    }
  }
  return undefined;
}

const lowerIsBetter = (metricId: string): boolean => healthcareMetrics.find((metric) => metric.id === metricId)?.lowerIsBetter === true;

/** The value column a ranking is ordered by, and what it means. */
function valueColumn(first: Row): { column: string; label: string; measure: SummaryMeasure } | undefined {
  if ("score" in first && typeof first.measure_code === "string") {
    const known = measureOfCode(first.measure_code);
    const survey = known?.metricId === "patient-experience";
    const name = String(first.dimension_name ?? first.measure_name ?? known?.conceptName ?? "score");
    const unit =
      typeof first.score_unit === "string" ? first.score_unit : survey ? (first.measure_code === "H_STAR_RATING" ? "stars (1-5)" : "points out of 100") : "percent";
    return {
      column: "score",
      label: survey ? `${known?.conceptName ?? name} score` : name,
      measure: {
        name: survey ? `${known?.conceptName ?? name} (patient survey)` : name,
        unit,
        better: known && lowerIsBetter(known.metricId) ? "lower" : "higher",
        ...("compared_to_national" in first ? { benchmark: "each hospital is rated Better, No Different or Worse than the national rate" } : {}),
      },
    };
  }
  if ("excess_readmission_ratio" in first) {
    const known = typeof first.measure_code === "string" ? measureOfCode(first.measure_code) : undefined;
    return {
      column: "excess_readmission_ratio",
      label: "Excess readmission ratio",
      measure: { name: `${known?.conceptName ?? "Condition"} readmission (excess readmission ratio)`, unit: "ratio, 1.0 = expected", better: "lower" },
    };
  }
  if ("safety_score" in first) {
    return { column: "safety_score", label: "Safety score", measure: { name: "CMS safety performance score", unit: "points out of 100", better: "higher" } };
  }
  if ("avg_patient_satisfaction" in first) {
    return {
      column: "avg_patient_satisfaction",
      label: "Patient experience score",
      measure: { name: "Average patient-survey score", unit: "points out of 100", better: "higher" },
    };
  }
  if ("mort_measures_better" in first && !("readm_measures_better" in first)) {
    return {
      column: "mort_measures_better",
      label: "Mortality measures better than national",
      measure: { name: "Number of mortality measures better than the national rate", better: "higher" },
    };
  }
  if ("readm_measures_better" in first && !("mort_measures_better" in first)) {
    return {
      column: "readm_measures_better",
      label: "Readmission measures better than national",
      measure: { name: "Number of readmission measures better than the national rate", better: "higher" },
    };
  }
  if ("overall_rating" in first) {
    return { column: "overall_rating", label: "Overall rating (stars)", measure: { name: "CMS overall hospital star rating", unit: "stars (1-5)", better: "higher" } };
  }
  return undefined;
}

const OWNERSHIP_LABEL_BY_PATTERN = new Map(Array.from(OWNERSHIP.values()).map((value) => [value.likePattern, value.label]));
const TYPE_LABEL_BY_PATTERN = new Map(Array.from(HOSPITAL_TYPES.values()).map((value) => [value.likePattern, value.label]));

/** The applied filters, in plain words, read from the parameters the engine executed with. */
export function summaryFilters(parameters: Readonly<Record<string, unknown>> | undefined): string[] {
  if (!parameters) {
    return [];
  }

  const filters: string[] = [];
  const states = Array.isArray(parameters.states) && parameters.multiState === true ? parameters.states : typeof parameters.state === "string" ? [parameters.state] : [];

  if (states.length > 0) filters.push(states.map((code) => STATE_NAMES_BY_CODE.get(String(code)) ?? String(code)).join(" and "));
  if (typeof parameters.county === "string") filters.push(`${titleCase(parameters.county)} County`);
  if (typeof parameters.city === "string") filters.push(titleCase(parameters.city));
  if (typeof parameters.ownership === "string") filters.push(`${OWNERSHIP_LABEL_BY_PATTERN.get(parameters.ownership) ?? parameters.ownership} ownership`);
  if (typeof parameters.hospitalType === "string") filters.push(`${TYPE_LABEL_BY_PATTERN.get(parameters.hospitalType) ?? parameters.hospitalType} hospitals`);
  if (parameters.emergencyServices !== undefined) filters.push("provides emergency services");
  if (parameters.birthingFriendly !== undefined) filters.push("CMS Birthing-Friendly designation");
  if (typeof parameters.overallRating === "string") filters.push(`${parameters.overallRating}-star overall rating`);

  return filters;
}

/** Plain labels for the columns a summary may need; any other column (ids, codes, counters) is left out. */
const COLUMN_LABELS: Record<string, string> = {
  hospital_name: "Hospital",
  city: "City",
  state: "State",
  hospital_type: "Type",
  ownership: "Ownership",
  overall_rating: "Overall rating (stars)",
  emergency_services: "Emergency services",
  birthing_friendly: "Birthing-friendly",
  compared_to_national: "Compared with national",
  star_rating: "Survey star rating",
  avg_patient_satisfaction: "Patient experience score",
  mort_measures_better: "Mortality measures better than national",
  mort_measures_worse: "Mortality measures worse than national",
  readm_measures_better: "Readmission measures better than national",
  readm_measures_worse: "Readmission measures worse than national",
  safety_measures_better: "Safety measures better than national",
  safety_measures_worse: "Safety measures worse than national",
  safety_score: "Safety score",
};

function humanRow(row: Row, value?: { column: string; label: string }): Record<string, string | number> {
  const out: Record<string, string | number> = {};

  for (const [column, label] of Object.entries(COLUMN_LABELS)) {
    const cell = row[column];
    if (cell === undefined || cell === null || cell === "") continue;
    if (column === "hospital_name" || column === "city" || column === "ownership") {
      out[label] = titleCase(cell);
    } else if (typeof cell === "boolean") {
      out[label] = cell ? "Yes" : "No";
    } else if (column === "birthing_friendly") {
      out[label] = cell === "Y" ? "Yes" : "No";
    } else if (column === "compared_to_national") {
      out[label] = String(cell).replace(/ the National Rate| National Value/i, "").trim();
    } else {
      out[label] = typeof cell === "number" ? cell : String(cell);
    }
  }
  if (value && !(value.column in COLUMN_LABELS)) {
    const cell = numberOf(row[value.column]);
    if (cell !== undefined) out[value.label] = cell;
  }
  return out;
}

export function buildSummaryContext(input: {
  rows: readonly Row[];
  parameters?: Readonly<Record<string, unknown>>;
  alreadyShown?: readonly string[];
}): SummaryContext {
  const { rows, parameters } = input;
  const first = rows[0] ?? {};
  const value = valueColumn(first);
  const hasIdentityList = Array.isArray(parameters?.facilityIds);
  // A list (the list templates) carries emergency_services and is ordered by name, not by its rating column; every
  // other shape with a value column is ordered best first by its template, with or without a ranking word.
  const listShape = "emergency_services" in first && value?.column === "overall_rating";
  // 2,000 sweep (Batch E): the top-rated hospital in each county or state ("Break down the best hospitals by county in
  // Texas") comes ordered by the group, not by rating: read as a ranking, the first county's 1-star hospital "led".
  // Only the grouping templates return rows without a city, one per group.
  const groupedBy = !("city" in first) && rows.length > 1
    ? (["county", "state"] as const).find((key) => key in first && new Set(rows.map((row) => row[key])).size === rows.length)
    : undefined;
  const kind: SummaryContext["kind"] = hasIdentityList
    ? "comparison"
    : groupedBy
      ? "grouped"
    : rows.length === 1 && "hospital_type" in first && ("mort_measures_better" in first || "birthing_friendly" in first)
      ? "profile"
      : listShape
        ? "list"
        : value !== undefined && rows.length > 1
          ? "ranking"
          : "table";
  // A ranking's first 10 are its answer; a list is described by its facts (counts by type and state), so 12 rows are
  // enough to name examples and keep the call inside the summary deadline (32 list rows measured 3.7 s).
  const shown = kind === "ranking" ? rows.slice(0, 10) : rows.slice(0, 12);
  const facts: Record<string, unknown> = { hospitalsShown: rows.length };

  if (kind === "ranking" && value) {
    const values = rows.map((row) => numberOf(row[value.column])).filter((number): number is number => number !== undefined);
    const leader = rows[0]!;
    facts.leader = {
      hospital: titleCase(leader.hospital_name),
      place: [titleCase(leader.city), leader.state].filter(Boolean).join(", "),
      value: numberOf(leader[value.column]),
    };
    if (values.length > 0 && Math.min(...values) === Math.max(...values)) {
      // "5 to 5" is not a range: every hospital shown holds the same value.
      facts.everyHospitalShownHasValue = values[0];
    } else if (values.length > 0) {
      facts.bestShown = values[0];
      facts.lastShown = values[values.length - 1];
      facts.lowestShown = Math.min(...values);
      facts.highestShown = Math.max(...values);
      const topValue = values[0];
      const sharingTop = values.filter((number) => number === topValue).length;
      if (sharingTop >= 2) {
        facts.hospitalsSharingTheTopValue = sharingTop;
      }
    }
  }

  if ("compared_to_national" in first) {
    const verdicts = rows.map((row) => String(row.compared_to_national ?? ""));
    facts.betterThanNational = verdicts.filter((verdict) => /^better/i.test(verdict)).length;
    facts.noDifferentFromNational = verdicts.filter((verdict) => /^no different/i.test(verdict)).length;
    facts.worseThanNational = verdicts.filter((verdict) => /^worse/i.test(verdict)).length;
  }

  const stateCounts = new Map<string, number>();
  for (const row of rows) {
    if (typeof row.state === "string") stateCounts.set(row.state, (stateCounts.get(row.state) ?? 0) + 1);
  }
  if (stateCounts.size > 1) {
    facts.statesRepresented = stateCounts.size;
    facts.hospitalsByState = Object.fromEntries(
      [...stateCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, count]) => [STATE_NAMES_BY_CODE.get(code) ?? code, count]),
    );
  }

  if (kind === "list") {
    facts.withOverallRating = rows.filter((row) => row.overall_rating !== null && row.overall_rating !== undefined).length;
    if ("emergency_services" in first) facts.withEmergencyServices = rows.filter((row) => row.emergency_services === true).length;
    const types = new Map<string, number>();
    for (const row of rows) {
      if (typeof row.hospital_type === "string") types.set(row.hospital_type, (types.get(row.hospital_type) ?? 0) + 1);
    }
    if (types.size > 1) facts.hospitalsByType = Object.fromEntries([...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4));
  }

  const scope =
    kind === "ranking"
      ? `${rows.length} hospitals ranked, best first (${value?.measure.better === "lower" ? "lowest" : "highest"} value is best)`
      : kind === "list"
        ? `${rows.length} hospitals listed alphabetically, not ranked`
        : kind === "profile"
          ? "one hospital's profile"
          : kind === "comparison"
            ? `${rows.length} hospitals compared side by side`
            : kind === "grouped"
              ? `the top-rated hospital in each of ${rows.length} ${groupedBy === "county" ? "counties" : "states"}, listed by ${groupedBy}, not ranked against each other`
              : `${rows.length} rows`;

  return {
    kind,
    ...(value && kind !== "list" ? { measure: value.measure } : {}),
    filters: summaryFilters(parameters),
    scope,
    facts,
    rows: shown.map((row) => humanRow(row, value)),
    alreadyShown: [...(input.alreadyShown ?? [])],
  };
}

/** Every number the prepared context states (facts and scope), as the text the grounding check compares with. */
export function summaryFactNumbers(context: SummaryContext): string[] {
  const numbers = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "number") {
      numbers.add(String(value));
    } else if (typeof value === "string") {
      for (const match of value.match(/\d+(\.\d+)?/g) ?? []) numbers.add(match);
    } else if (value && typeof value === "object") {
      for (const inner of Object.values(value)) visit(inner);
    }
  };
  visit(context.facts);
  visit(context.scope);
  visit(context.filters);
  visit(context.measure);
  return [...numbers];
}

/** Every name the prepared context states (filters, measure, place), for the grounding check's vocabulary. */
export function summaryVocabulary(context: SummaryContext): string[] {
  return [
    ...context.filters,
    ...(context.measure ? [context.measure.name, context.measure.unit ?? ""] : []),
    ...context.rows.flatMap((row) => Object.values(row).map(String)),
  ].filter((text) => text.length > 0);
}
