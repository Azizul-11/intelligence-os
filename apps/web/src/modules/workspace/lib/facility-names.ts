import { useQuery } from "@tanstack/react-query";

import { activeDomain } from "@/domains";

const NO_NAMES: Record<string, string> = {};

// The active domain's facility_id -> name map. It loads once per session and is cached, so calling this on the chat page
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
