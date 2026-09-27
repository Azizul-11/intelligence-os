import type { SqlTemplateDefinition } from "@intelligence/domain-sdk";

export const hospitalDetailSqlTemplate: SqlTemplateDefinition = {
  id: "hospital-detail",

  name: "hospital-detail",

  displayName: "Hospital Detail",

  description:
    "Returns a full cross-table profile for a single hospital: identity fields, the aggregate better/no-different/worse counts per measure family, and (2026-09-27 dossier expansion) every individual measure's own value - all 7 condition mortality rates plus hip/knee complications, all 6 HRRP readmission ratios, all 12 Patient Safety Indicators, and all 7 HCAHPS survey dimension scores - the same set the multi-hospital compare path fetches via its -by-facility-ids template.",

  template: `
SELECT
    h.facility_id,
    h.hospital_name,
    h.city,
    h.state,
    h.county,
    h.hospital_type,
    h.ownership,
    h.overall_rating,
    h.emergency_services,
    COALESCE(h.birthing_friendly, 'N') AS birthing_friendly,
    h.mort_measures_better,
    h.mort_measures_no_different,
    h.mort_measures_worse,
    h.facility_mort_measure_count,
    h.readm_measures_better,
    h.readm_measures_no_different,
    h.readm_measures_worse,
    h.facility_readm_measure_count,
    h.safety_measures_better,
    h.safety_measures_no_different,
    h.safety_measures_worse,
    h.facility_safety_measure_count,
    CAST(AVG(hc.linear_mean_value) AS NUMERIC(10,2)) AS avg_patient_satisfaction,
    -- Dossier expansion (2026-09-27): one column per registered measure code, pivoted from the long/EAV-shaped
    -- source tables with conditional aggregation so the GROUP BY below still returns exactly one row per hospital
    -- (Phase 7.5.8 alignment) - MAX/AVG of a CASE expression is unaffected by how many join rows feed it.
    MAX(CASE WHEN co.measure_code = 'MORT_30_AMI' THEN co.score END) AS mort_30_ami_score,
    MAX(CASE WHEN co.measure_code = 'MORT_30_HF' THEN co.score END) AS mort_30_hf_score,
    MAX(CASE WHEN co.measure_code = 'MORT_30_PN' THEN co.score END) AS mort_30_pn_score,
    MAX(CASE WHEN co.measure_code = 'MORT_30_COPD' THEN co.score END) AS mort_30_copd_score,
    MAX(CASE WHEN co.measure_code = 'MORT_30_CABG' THEN co.score END) AS mort_30_cabg_score,
    MAX(CASE WHEN co.measure_code = 'MORT_30_STK' THEN co.score END) AS mort_30_stk_score,
    MAX(CASE WHEN co.measure_code = 'Hybrid_HWM' THEN co.score END) AS hybrid_hwm_score,
    MAX(CASE WHEN co.measure_code = 'COMP_HIP_KNEE' THEN co.score END) AS comp_hip_knee_score,
    MAX(CASE WHEN co.measure_code = 'PSI_03' THEN co.score END) AS psi_03_score,
    MAX(CASE WHEN co.measure_code = 'PSI_04' THEN co.score END) AS psi_04_score,
    MAX(CASE WHEN co.measure_code = 'PSI_06' THEN co.score END) AS psi_06_score,
    MAX(CASE WHEN co.measure_code = 'PSI_08' THEN co.score END) AS psi_08_score,
    MAX(CASE WHEN co.measure_code = 'PSI_09' THEN co.score END) AS psi_09_score,
    MAX(CASE WHEN co.measure_code = 'PSI_10' THEN co.score END) AS psi_10_score,
    MAX(CASE WHEN co.measure_code = 'PSI_11' THEN co.score END) AS psi_11_score,
    MAX(CASE WHEN co.measure_code = 'PSI_12' THEN co.score END) AS psi_12_score,
    MAX(CASE WHEN co.measure_code = 'PSI_13' THEN co.score END) AS psi_13_score,
    MAX(CASE WHEN co.measure_code = 'PSI_14' THEN co.score END) AS psi_14_score,
    MAX(CASE WHEN co.measure_code = 'PSI_15' THEN co.score END) AS psi_15_score,
    MAX(CASE WHEN co.measure_code = 'PSI_90' THEN co.score END) AS psi_90_score,
    MAX(CASE WHEN rd.measure_code = 'READM-30-AMI-HRRP' THEN rd.excess_readmission_ratio END) AS readm_30_ami_ratio,
    MAX(CASE WHEN rd.measure_code = 'READM-30-HF-HRRP' THEN rd.excess_readmission_ratio END) AS readm_30_hf_ratio,
    MAX(CASE WHEN rd.measure_code = 'READM-30-PN-HRRP' THEN rd.excess_readmission_ratio END) AS readm_30_pn_ratio,
    MAX(CASE WHEN rd.measure_code = 'READM-30-COPD-HRRP' THEN rd.excess_readmission_ratio END) AS readm_30_copd_ratio,
    MAX(CASE WHEN rd.measure_code = 'READM-30-CABG-HRRP' THEN rd.excess_readmission_ratio END) AS readm_30_cabg_ratio,
    MAX(CASE WHEN rd.measure_code = 'READM-30-HIP-KNEE-HRRP' THEN rd.excess_readmission_ratio END) AS readm_30_hip_knee_ratio,
    MAX(CASE WHEN hc.measure_code = 'H_CLEAN_LINEAR_SCORE' THEN hc.linear_mean_value END) AS hcahps_cleanliness_score,
    MAX(CASE WHEN hc.measure_code = 'H_QUIET_LINEAR_SCORE' THEN hc.linear_mean_value END) AS hcahps_quietness_score,
    MAX(CASE WHEN hc.measure_code = 'H_COMP_1_LINEAR_SCORE' THEN hc.linear_mean_value END) AS hcahps_nurse_comm_score,
    MAX(CASE WHEN hc.measure_code = 'H_COMP_2_LINEAR_SCORE' THEN hc.linear_mean_value END) AS hcahps_doctor_comm_score,
    MAX(CASE WHEN hc.measure_code = 'H_COMP_5_LINEAR_SCORE' THEN hc.linear_mean_value END) AS hcahps_medicine_comm_score,
    MAX(CASE WHEN hc.measure_code = 'H_COMP_6_LINEAR_SCORE' THEN hc.linear_mean_value END) AS hcahps_discharge_info_score,
    MAX(CASE WHEN hc.measure_code = 'H_RECMND_LINEAR_SCORE' THEN hc.linear_mean_value END) AS hcahps_recommend_score
FROM warehouse_hospitals h
LEFT JOIN warehouse_hospital_hcahps hc
    ON h.facility_id = hc.facility_id
LEFT JOIN warehouse_hospital_clinical_outcomes co
    ON h.facility_id = co.facility_id
LEFT JOIN warehouse_hospital_readmissions rd
    ON h.facility_id = rd.facility_id
WHERE h.facility_id = :hospitalId
GROUP BY
    h.facility_id,
    h.hospital_name,
    h.city,
    h.state,
    h.county,
    h.hospital_type,
    h.ownership,
    h.overall_rating,
    h.emergency_services,
    h.birthing_friendly,
    h.mort_measures_better,
    h.mort_measures_no_different,
    h.mort_measures_worse,
    h.facility_mort_measure_count,
    h.readm_measures_better,
    h.readm_measures_no_different,
    h.readm_measures_worse,
    h.facility_readm_measure_count,
    h.safety_measures_better,
    h.safety_measures_no_different,
    h.safety_measures_worse,
    h.facility_safety_measure_count
`.trim(),

  type: "lookup",

  parameters: [
    {
      name: "hospitalId",
      type: "string",
      required: true,
      description: "Hospital identifier",
    },
  ],

  deterministic: true,

  enabled: true,

  // Phase 8.6B: this template's only filter is the requested hospital's
  // own identity in `warehouse_hospitals` - the same table entity
  // resolution itself uses, so a validly-resolved hospital can never
  // actually produce zero rows here. Opted in for consistency (safe,
  // though effectively inert for this specific template).
  singleEntityRecord: true,
};
