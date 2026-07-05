import type { RecommendationRegistration } from "./recommendation-registration";
import type { RecommendationRegistryContext } from "./recommendation-registry-context";
import type { RecommendationRegistryResult } from "./recommendation-registry-result";

export interface RecommendationRegistry {
  register(
    registration: RecommendationRegistration
  ): void;

  list(
    context: RecommendationRegistryContext
  ): RecommendationRegistryResult;
}