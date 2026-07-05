export * from "./national-average";
export * from "./state-average";
export * from "./top-decile";
export * from "./median";
export * from "./hospital-star-rating";

import { nationalAverageBenchmark } from "./national-average";
import { stateAverageBenchmark } from "./state-average";
import { topDecileBenchmark } from "./top-decile";
import { medianBenchmark } from "./median";
import { hospitalStarRatingBenchmark } from "./hospital-star-rating";

export const healthcareBenchmarks = [
    nationalAverageBenchmark,
    stateAverageBenchmark,
    topDecileBenchmark,
    medianBenchmark,
    hospitalStarRatingBenchmark,
] as const;