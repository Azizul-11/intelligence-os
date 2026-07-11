import { supabase } from "../shared/supabase";

function mapHospital(hospital: Record<string, any>) {
  return {
    facility_id: hospital.facilityId,
    hospital_name: hospital.hospitalName,
    address: hospital.address,
    city: hospital.city,
    state: hospital.state,
    zip_code: hospital.zipCode,
    county: hospital.county,
    phone_number: hospital.phoneNumber,
    hospital_type: hospital.hospitalType,
    ownership: hospital.ownership,
    emergency_services: hospital.emergencyServices,

    // Remaining columns will be added once normalization includes them.
    birthing_friendly: null,

    overall_rating: null,
    overall_rating_footnote: null,

    mort_group_measure_count: null,
    facility_mort_measure_count: null,
    mort_measures_better: null,
    mort_measures_no_different: null,
    mort_measures_worse: null,
    mort_group_footnote: null,

    safety_group_measure_count: null,
    facility_safety_measure_count: null,
    safety_measures_better: null,
    safety_measures_no_different: null,
    safety_measures_worse: null,
    safety_group_footnote: null,

    readm_group_measure_count: null,
    facility_readm_measure_count: null,
    readm_measures_better: null,
    readm_measures_no_different: null,
    readm_measures_worse: null,
    readm_group_footnote: null,

    patient_experience_group_measure_count: null,
    facility_patient_experience_measure_count: null,
    patient_experience_group_footnote: null,

    te_group_measure_count: null,
    facility_te_measure_count: null,
    te_group_footnote: null,
  };
}

export async function insertHospitals(
  hospitals: Record<string, any>[],
) {
  const rows = hospitals.map(mapHospital);

  const { error } = await supabase
    .from("warehouse_hospitals")
    .upsert(rows, {
      onConflict: "facility_id",
    });

  if (error) {
    throw error;
  }

  return rows.length;
}