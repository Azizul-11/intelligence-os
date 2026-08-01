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
    birthing_friendly: hospital.birthingFriendly,

    overall_rating: hospital.overallRating,
overall_rating_footnote: hospital.overallRatingFootnote,

mort_group_measure_count: hospital.mortGroupMeasureCount,
facility_mort_measure_count: hospital.facilityMortMeasureCount,
mort_measures_better: hospital.mortMeasuresBetter,
mort_measures_no_different: hospital.mortMeasuresNoDifferent,
mort_measures_worse: hospital.mortMeasuresWorse,
mort_group_footnote: hospital.mortGroupFootnote,

safety_group_measure_count: hospital.safetyGroupMeasureCount,
facility_safety_measure_count: hospital.facilitySafetyMeasureCount,
safety_measures_better: hospital.safetyMeasuresBetter,
safety_measures_no_different: hospital.safetyMeasuresNoDifferent,
safety_measures_worse: hospital.safetyMeasuresWorse,
safety_group_footnote: hospital.safetyGroupFootnote,

   readm_group_measure_count: hospital.readmGroupMeasureCount,
facility_readm_measure_count: hospital.facilityReadmMeasureCount,
readm_measures_better: hospital.readmMeasuresBetter,
readm_measures_no_different: hospital.readmMeasuresNoDifferent,
readm_measures_worse: hospital.readmMeasuresWorse,
readm_group_footnote: hospital.readmGroupFootnote,

patient_experience_group_measure_count:
  hospital.patientExperienceGroupMeasureCount,

facility_patient_experience_measure_count:
  hospital.facilityPatientExperienceMeasureCount,

patient_experience_group_footnote:
  hospital.patientExperienceGroupFootnote,

te_group_measure_count: hospital.teGroupMeasureCount,
facility_te_measure_count: hospital.facilityTeMeasureCount,
te_group_footnote: hospital.teGroupFootnote,
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