export interface NormalizedHospitalReadmissionRecord {
    facilityId: string;
    measureCode: string;
    state: string;
    numberOfDischargesRaw: string | null;
    numberOfReadmissionsRaw: string | null;
    predictedReadmissionRate: number | null;
    expectedReadmissionRate: number | null;
    excessReadmissionRatio: number | null;
    footnote: string | null;
    reportingStartDate: Date;
    reportingEndDate: Date;
}