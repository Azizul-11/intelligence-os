import { useQuery } from "@tanstack/react-query";

import { activeDomain } from "@/domains";

import { planColumns, type Row } from "./result-format";

const NO_NAMES: Record<string, string> = {};

// The active domain's id -> name map. It loads once per session and is cached, so calling this on the chat page
// starts the load before the first answer arrives. Until the map is ready, rows keep their IDs.
export function useFacilityNames(): Record<string, string> {
  const load = activeDomain.facilityNames;
  const { data } = useQuery({
    queryKey: ["facility-names", activeDomain.id],
    queryFn: () => (load ? load() : NO_NAMES),
    staleTime: Infinity,
  });
  return data ?? NO_NAMES;
}

// Runs the active domain's enrichRows on rows that have no name column. Without a hook, rows come back untouched.
export function enrichRows(rows: Row[], names: Record<string, string>): Row[] {
  if (rows.length === 0 || planColumns(rows).nameKey !== undefined) return rows;
  return activeDomain.enrichRows?.(rows, names) ?? rows;
}
