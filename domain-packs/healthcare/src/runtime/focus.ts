import type { ExecutionPlan } from "@intelligence/contracts";

import { DOSSIER_COMPARABLE_METRICS, HealthcareExecutionStrategy } from "./execution-strategy";

const ATTRIBUTE_FIELDS = ["birthingFriendly", "emergencyServices", "hospitalType", "ownership"] as const;

const strategy = new HealthcareExecutionStrategy();

/** What a one-hospital answer is about, read from the plan and the template that answered it; never from the rows or any model text.
 * `fact` = one value asked for; `family` = a measure family. Undefined when the answer is just the hospital's profile or not about one hospital.
 * A comparison of named hospitals answered from the dossier rows carries the asked family (and condition) so the view can focus it. */
export function describeResultFocus(
  plan: ExecutionPlan,
  rows: readonly Record<string, unknown>[],
): Record<string, string | undefined> | undefined {
  const measureCodeValue = plan.filters.find((filter) => filter.field === "measureCode" || filter.field === "measure_code")?.value;
  const measureCode = measureCodeValue === undefined ? undefined : String(measureCodeValue);

  const comparedSet = plan.operation === "compare" && plan.filters.some((filter) => filter.field === "hospital" && filter.operator === "in");

  if (comparedSet) {
    const answeredFromDossierRows = strategy.selectTemplateFromPlan(plan) === "hospital-detail-by-facility-ids";

    return rows.length >= 2 && answeredFromDossierRows && DOSSIER_COMPARABLE_METRICS.has(plan.metric)
      ? { kind: "family", metric: plan.metric, ...(measureCode ? { measureCode } : {}) }
      : undefined;
  }

  const singleHospital = plan.filters.some((filter) => filter.field === "hospital" && filter.operator === "=");

  if (!singleHospital || rows.length === 0) {
    return undefined;
  }

  switch (strategy.selectTemplateFromPlan(plan)) {
    case "hospital-overall-rating":
      return rows.length === 1 ? { kind: "fact", metric: "hospital-overall-rating" } : undefined;

    case "hospital-detail": {
      const attributes: string[] = ATTRIBUTE_FIELDS.filter((field) => plan.filters.some((filter) => filter.field === field));

      if (plan.grouping?.dimensions.includes("county-dimension")) {
        attributes.push("county");
      }

      // Exactly one asked-for attribute is a fact; none (or several) is a request for the profile itself.
      return rows.length === 1 && attributes.length === 1 ? { kind: "fact", attribute: attributes[0] } : undefined;
    }

    case "mortality-rate":
      return measureCode && rows.length === 1
        ? { kind: "fact", metric: "mortality-rate", measureCode }
        : { kind: "family", metric: "mortality-rate", measureCode };

    case "readmission-rate":
      return { kind: "family", metric: "readmission-rate", measureCode };

    case "patient-experience":
      return { kind: "family", metric: "patient-experience" };

    default:
      return undefined;
  }
}
