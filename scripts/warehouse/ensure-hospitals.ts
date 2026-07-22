import { supabase } from "../shared/supabase";

export interface PartialHospital {
  facilityId: string;
  facilityName?: string | null;
  state?: string | null;
}

function chunkArray<T>(
  array: T[],
  size: number,
): T[][] {
  const chunks: T[][] = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

export async function ensureHospitals(
  hospitals: PartialHospital[],
) {
  // Remove duplicate facilities
  const uniqueHospitals = Array.from(
    new Map(
      hospitals.map((hospital) => [
        hospital.facilityId,
        hospital,
      ]),
    ).values(),
  );

  console.log(
    `Ensuring ${uniqueHospitals.length} unique hospitals...`,
  );

  // Extract all facility IDs
  const facilityIds = uniqueHospitals.map(
    (hospital) => hospital.facilityId,
  );

  // Query in batches to avoid PostgREST URL/request limits
  const batches = chunkArray(facilityIds, 500);

  const existingFacilityIds = new Set<string>();

  for (const batch of batches) {
    const { data, error } = await supabase
      .from("warehouse_hospitals")
      .select("facility_id")
      .in("facility_id", batch);

    if (error) {
      throw error;
    }

    for (const hospital of data ?? []) {
      existingFacilityIds.add(hospital.facility_id);
    }
  }

  // Determine which hospitals are missing
  const missingHospitals = uniqueHospitals.filter(
    (hospital) =>
      !existingFacilityIds.has(hospital.facilityId),
  );

  console.log(
    `Missing hospitals: ${missingHospitals.length}`,
  );

  // Nothing to do
if (missingHospitals.length === 0) {
  return;
}

const placeholderHospitals = missingHospitals.map(
  (hospital) => ({
    facility_id: hospital.facilityId,
   hospital_name:
  hospital.facilityName ??
  "Unknown Hospital",
    state: hospital.state ?? null,
  }),
);

const { error: insertError } = await supabase
  .from("warehouse_hospitals")
  .upsert(placeholderHospitals, {
    onConflict: "facility_id",
  });

if (insertError) {
  throw insertError;
}

console.log(
  `Inserted ${placeholderHospitals.length} placeholder hospitals.`,
);
}