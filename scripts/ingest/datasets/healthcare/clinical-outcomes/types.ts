export interface NormalizedHospitalClinicalOutcomeRecord {
  facilityId: string;

  measureCode: string;

  measureName: string;

  comparedToNational: string | null;

  denominator: number | null;

  score: number | null;

  lowerEstimate: number | null;

  higherEstimate: number | null;

  footnote: string | null;

  reportingStartDate: Date;

  reportingEndDate: Date;
}