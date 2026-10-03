// Shapes and labels for chat result rows. Display helpers only: CSV export and sorting still use the raw values.

export type Row = Record<string, unknown>;

export type ColumnPlan = {
  nameKey: string | undefined;
  measureKey: string | undefined;
  rest: string[];
  idKeys: string[];
};

const SMALL_WORDS = new Set(["a", "and", "at", "de", "del", "for", "in", "la", "of", "the", "y"]);

export function parseRows(answer: string): Row[] {
  try {
    const parsed: unknown = JSON.parse(answer);
    return Array.isArray(parsed) ? (parsed as Row[]) : [];
  } catch {
    return [];
  }
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
  return null;
}

export function isNumericColumn(rows: Row[], column: string): boolean {
  return rows.every((row) => row[column] === null || row[column] === undefined || row[column] === "" || asNumber(row[column]) !== null);
}

export function compareCells(a: unknown, b: unknown): number {
  const numA = asNumber(a);
  const numB = asNumber(b);
  if (numA !== null && numB !== null) return numA - numB;
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
}

// "hospital_name" -> "Hospital name", "facility_id" -> "Facility ID".
export function columnLabel(column: string): string {
  const text = column
    .split("_")
    .filter(Boolean)
    .map((word) => (word.toLowerCase() === "id" ? "ID" : word.toLowerCase()))
    .join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The data often arrives in capitals ("UF HEALTH SHANDS HOSPITAL"). All-caps text is shown in title case;
// mixed-case text is left alone. Words of two letters or fewer stay capitals (UF, VA, MD).
export function displayValue(value: unknown): string {
  const text = String(value ?? "");
  if (!/[A-Z]/.test(text) || text !== text.toUpperCase()) return text;
  return text
    .split(" ")
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      if (word.length <= 2) return word;
      return lower.replace(/(^|-)([a-z])/g, (_, separator: string, letter: string) => separator + letter.toUpperCase());
    })
    .join(" ");
}

// The measure is the first numeric column that is neither the name nor an ID. It is a guess from the data shape;
// the backend already knows the real measure (context.measure) and could pass it through to replace this.
export function planColumns(rows: Row[]): ColumnPlan {
  const keys = Object.keys(rows[0] ?? {});
  // measure_name describes a metric (e.g. "Death rate for AMI"), not the entity, so it is never the name column.
  const nameKey = keys.find((key) => /(^|_)name$/i.test(key) && !/^measure_/i.test(key));
  const idKeys = keys.filter((key) => key !== nameKey && /(^|_)id$/i.test(key));
  const others = keys.filter((key) => key !== nameKey && !idKeys.includes(key));
  const measureKey = others.find((key) => isNumericColumn(rows, key) && rows.some((row) => asNumber(row[key]) !== null));
  return { nameKey, measureKey, rest: others.filter((key) => key !== measureKey), idKeys };
}

// Name first, then the measured column, then the rest in the backend's order, then ID columns last.
export function orderColumns(rows: Row[]): string[] {
  const { nameKey, measureKey, rest, idKeys } = planColumns(rows);
  return [nameKey, measureKey, ...rest, ...idKeys].filter((key): key is string => key !== undefined);
}

// Per-hospital answers carry facility_id but no name. When a result has no name column, this adds hospital_name from the
// domain's map. An ID the map does not know shows as the ID itself. Nothing is added until the map has loaded.
export function withFacilityNames(rows: Row[], names: Record<string, string>): Row[] {
  const first = rows[0];
  if (!first || !("facility_id" in first) || planColumns(rows).nameKey !== undefined) return rows;
  if (Object.keys(names).length === 0) return rows;
  return rows.map((row) => ({ ...row, hospital_name: names[String(row.facility_id)] ?? String(row.facility_id) }));
}
