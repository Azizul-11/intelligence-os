-- =====================================================
-- MVP BATCH #2 PHASE 1 - DATA VALIDATION
-- =====================================================
-- Execute these queries before implementing any capability
-- Report results back to proceed with implementation
-- =====================================================

-- VALIDATION 1: Ownership values and distribution
-- Purpose: Determine exact ownership values for government filter
-- Expected: Confirm if "Government" prefix exists and exact format

SELECT ownership, COUNT(*) as count
FROM warehouse_hospitals
WHERE ownership IS NOT NULL
GROUP BY ownership
ORDER BY ownership;

-- VALIDATION 2: Emergency services data type and distribution
-- Purpose: Confirm boolean type and value distribution
-- Expected: true/false or other representation

SELECT emergency_services, COUNT(*) as count
FROM warehouse_hospitals
GROUP BY emergency_services
ORDER BY emergency_services;

-- VALIDATION 3: Overall rating values and type
-- Purpose: Determine rating values for Phase 2 rating filter
-- Expected: '1', '2', '3', '4', '5', 'Not Available', or other

SELECT overall_rating, COUNT(*) as count
FROM warehouse_hospitals
WHERE overall_rating IS NOT NULL
GROUP BY overall_rating
ORDER BY overall_rating;

-- VALIDATION 4: Safety measure data availability and distribution
-- Purpose: Confirm sufficient safety data exists for ranking
-- Expected: Adequate hospitals with safety_measures_better > 0

SELECT 
  COUNT(*) as total_hospitals,
  SUM(CASE WHEN facility_safety_measure_count > 0 THEN 1 ELSE 0 END) as with_safety_data,
  SUM(CASE WHEN safety_measures_better > 0 THEN 1 ELSE 0 END) as with_better_safety,
  MIN(safety_measures_better) as min_better,
  MAX(safety_measures_better) as max_better,
  AVG(safety_measures_better) as avg_better
FROM warehouse_hospitals
WHERE facility_safety_measure_count > 0;

-- VALIDATION 5: Safety measures sample data
-- Purpose: See actual safety data structure
-- Expected: Confirm field names and values are as expected

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

-- VALIDATION 6: HCAHPS patient survey star rating values (Phase 2)
-- Purpose: Determine rating format for Phase 2 patient survey filter
-- Expected: '1', '2', '3', '4', '5', or other format

SELECT patient_survey_star_rating, COUNT(DISTINCT facility_id) as hospital_count
FROM warehouse_hospital_hcahps
WHERE patient_survey_star_rating IS NOT NULL
GROUP BY patient_survey_star_rating
ORDER BY patient_survey_star_rating;

-- =====================================================
-- END VALIDATION QUERIES
-- =====================================================
