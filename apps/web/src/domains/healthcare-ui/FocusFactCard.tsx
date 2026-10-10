import { PanelRight, PanelRightClose, Star } from "lucide-react";

import { asNumber, displayValue } from "@/modules/workspace/lib/result-format";
import { Button } from "@/shared/components/ui/button";

import type { FocusCardProps, ResultFocus } from "../types";
import { readValue } from "./measures";

type Row = Record<string, unknown>;
type Fact = { title: string; value: string; note?: string; stars?: number };

const ATTRIBUTES: Record<string, { title: string; key: string; kind: "flag" | "text" }> = {
  birthingFriendly: { title: "Birthing-friendly", key: "birthing_friendly", kind: "flag" },
  emergencyServices: { title: "Emergency services", key: "emergency_services", kind: "flag" },
  hospitalType: { title: "Hospital type", key: "hospital_type", kind: "text" },
  ownership: { title: "Ownership", key: "ownership", kind: "text" },
  county: { title: "County", key: "county", kind: "text" },
};

// The fact the row answers, read only from the row. Null when the row cannot answer it, so the generic list shows instead.
export function describeFact(row: Row, focus: ResultFocus): Fact | null {
  if (focus.kind !== "fact") return null;

  const attribute = focus.attribute ? ATTRIBUTES[focus.attribute] : undefined;
  if (attribute) {
    if (!(attribute.key in row)) return null;
    const reading = readValue(row, { key: attribute.key, label: attribute.title, kind: attribute.kind });
    return { title: attribute.title, value: reading.text ?? "Not reported" };
  }

  if (focus.metric === "hospital-overall-rating" && "overall_rating" in row) {
    const rating = asNumber(row.overall_rating);
    return rating === null
      ? { title: "Overall rating", value: "Not rated" }
      : { title: "Overall rating", value: `${rating} of 5 stars`, stars: rating };
  }

  if (focus.metric === "mortality-rate" && focus.measureCode && "score" in row && typeof row.measure_name === "string") {
    const reading = readValue(row, { key: "score", label: "Score", unit: "%" });
    const verdict = typeof row.compared_to_national === "string" ? displayValue(row.compared_to_national) : undefined;
    return { title: displayValue(row.measure_name), value: reading.text ?? "Not reported", ...(verdict ? { note: verdict } : {}) };
  }

  return null;
}

export function FocusFactCard({ rows, focus, profile }: FocusCardProps) {
  const row = rows[0] ?? {};
  const fact = describeFact(row, focus);
  if (!fact) return null;

  const name = displayValue(row.hospital_name ?? row.facility_id ?? "");
  const place = [displayValue(row.city), String(row.state ?? "")].filter(Boolean).join(", ");

  return (
    <section aria-label={`${fact.title}: ${fact.value}`} className="mb-3 rounded-md border border-border p-4">
      <p className="break-words text-sm font-medium">{name}</p>
      {place && <p className="text-xs text-muted-foreground">{place}</p>}

      <p className="mt-3 text-xs text-muted-foreground">{fact.title}</p>
      <p className="flex flex-wrap items-center gap-2 text-2xl font-semibold tabular-nums">
        {fact.stars !== undefined && (
          <span aria-hidden="true" className="inline-flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} className={n <= fact.stars! ? "size-5 fill-primary text-primary" : "size-5 text-muted-foreground/40"} />
            ))}
          </span>
        )}
        <span>{fact.value}</span>
      </p>
      {fact.note && <p className="mt-1 text-xs text-muted-foreground">{fact.note}</p>}

      {profile && (
        <Button type="button" variant="outline" size="sm" onClick={profile.onToggle} className="mt-3 min-h-11 gap-2 px-3">
          {profile.open ? <PanelRightClose className="size-4" aria-hidden="true" /> : <PanelRight className="size-4" aria-hidden="true" />}
          {profile.open ? "Close canvas" : profile.label}
        </Button>
      )}
    </section>
  );
}
