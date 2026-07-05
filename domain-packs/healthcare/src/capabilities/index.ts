export * from "./benchmark-analysis";
export * from "./compare-hospitals";
export * from "./county-comparison";
export * from "./rank-hospitals";
export * from "./trend-analysis";


import { benchmarkAnalysisCapability } from "./benchmark-analysis";
import { compareHospitalsCapability } from "./compare-hospitals";
import { countyComparisonCapability } from "./county-comparison";
import { rankHospitalsCapability } from "./rank-hospitals";
import { trendAnalysisCapability } from "./trend-analysis";

export const healthcareCapabilities = [
    benchmarkAnalysisCapability,
    compareHospitalsCapability,
    countyComparisonCapability,
    rankHospitalsCapability,
    trendAnalysisCapability,
] as const;