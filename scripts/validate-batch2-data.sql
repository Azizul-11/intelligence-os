-- MVP BATCH #2 PHASE 1 - DATA VALIDATION: run before implementing any capability and report results

-- VALIDATION 1: ownership values for the government filter; confirm whether a "Government" prefix exists and its exact format

SELECT ownership, COUNT(*) as count
FROM warehouse_hospitals
WHERE ownership IS NOT NULL
GROUP BY ownership
ORDER BY ownership;

-- VALIDATION 2: emergency services type and distribution (expect boolean true/false or other)

SELECT emergency_services, COUNT(*) as count
FROM warehouse_hospitals
GROUP BY emergency_services
ORDER BY emergency_services;

-- VALIDATION 3: overall rating values and type for the Phase 2 rating filter ('1'-'5', 'Not Available', or other)

SELECT overall_rating, COUNT(*) as count
FROM warehouse_hospitals
WHERE overall_rating IS NOT NULL
GROUP BY overall_rating
ORDER BY overall_rating;

-- VALIDATION 4: safety data availability for ranking (expect adequate hospitals with safety_measures_better > 0)

SELECT 
  COUNT(*) as total_hospitals,
  SUM(CASE WHEN facility_safety_measure_count > 0 THEN 1 ELSE 0 END) as with_safety_data,
  SUM(CASE WHEN safety_measures_better > 0 THEN 1 ELSE 0 END) as with_better_safety,
  MIN(safety_measures_better) as min_better,
  MAX(safety_measures_better) as max_better,
  AVG(safety_measures_better) as avg_better
FROM warehouse_hospitals
WHERE facility_safety_measure_count > 0;

-- VALIDATION 5: safety measures sample; confirm field names and values

SELECT 
  facility_id,
  hospital_name,
  state,
  safety_measures_better,
  safety_measures_no_different,
  safety_measures_worse,
  facility_safety_measure_count
FROM warehouse_hospitals
WHERE facility_safety_measure_count > 0
ORDER BY safety_measures_better DESC NULLS LAST
LIMIT 10;

-- VALIDATION 6: HCAHPS star rating format for the Phase 2 patient survey filter (expect '1'-'5' or other)

SELECT patient_survey_star_rating, COUNT(DISTINCT facility_id) as hospital_count
FROM warehouse_hospital_hcahps
WHERE patient_survey_star_rating IS NOT NULL
GROUP BY patient_survey_star_rating
ORDER BY patient_survey_star_rating;

-- END VALIDATION QUERIES
