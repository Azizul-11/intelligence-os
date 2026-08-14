/**
 * Phase 5.2: ExecutionPlan Mapping Verification
 *
 * Tests semantic QueryPlan → ExecutionPlan conversion.
 * Verifies the mapper correctly translates Phase 4 semantic understanding
 * into Phase 5 deterministic execution structure.
 */

import { ExecutionPlanMapper } from "../packages/query-planner/src/execution-plan-mapper";
import type { QueryPlan } from "../packages/query-planner/src/query-plan";
import type { SemanticCollections } from "../packages/query-planner/src/semantic-collections";
import type { ExecutionPlan } from "../packages/contracts/src/execution/execution-plan";
import type { SemanticCandidate } from "../packages/semantic/src/candidate/SemanticCandidate";

interface TestCase {
  id: string;
  description: string;
  queryPlan: QueryPlan;
  expectations: {
    operation?: string;
    metric?: string;
    filterCount?: number;
    hasGrouping?: boolean;
    hasOrdering?: boolean;
    orderDirection?: "asc" | "desc";
    hasLimit?: boolean;
  };
}

const mapper = new ExecutionPlanMapper();

const testCases: TestCase[] = [
  {
    id: "MAP-1",
    description: "Ranking query with entity filter",
    queryPlan: {
      semantic: {
        metrics: [
          {
            phrase: "overall rating",
            canonicalKey: "hospital-overall-rating",
            semanticType: "metric",
            definition: {
              id: "hospital-overall-rating",
              name: "hospital-overall-rating",
              displayName: "Hospital Overall Rating",
            },
            confidence: 1,
            start: 0,
            end: 0,
          } as SemanticCandidate,
        ],
        entities: [
          {
            phrase: "california",
            canonicalKey: "state",
            semanticType: "entity",
            definition: {
              id: "state",
              name: "state",
              displayName: "State",
              execution: { parameter: "state" },
            },
            confidence: 1,
            start: 0,
            end: 0,
            resolvedValue: "CA",
          } as SemanticCandidate,
        ],
        dimensions: [],
        categories: [],
        benchmarks: [],
        relationships: [],
      },
      intent: "ranking",
      parameters: { state: "CA" },
      filters: [],
    },
    expectations: {
      operation: "rank",
      metric: "hospital-overall-rating",
      filterCount: 1,
      hasGrouping: false,
      hasOrdering: true,
      orderDirection: "desc",
      hasLimit: true,
    },
  },
  {
    id: "MAP-2",
    description: "Aggregation with dimension grouping",
    queryPlan: {
      semantic: {
        metrics: [
          {
            phrase: "hospital count",
            canonicalKey: "hospital-count",
            semanticType: "metric",
            definition: {
              id: "hospital-count",
              name: "hospital-count",
              displayName: "Hospital Count",
            },
            confidence: 1,
            start: 0,
            end: 0,
          } as SemanticCandidate,
        ],
        entities: [],
        dimensions: [
          {
            phrase: "by state",
            canonicalKey: "state-dimension",
            semanticType: "dimension",
            definition: {
              id: "state-dimension",
              name: "state",
              displayName: "State",
            },
            confidence: 1,
            start: 0,
            end: 0,
          } as SemanticCandidate,
        ],
        categories: [],
        benchmarks: [],
        relationships: [],
      },
      intent: "aggregation",
      parameters: {},
      filters: [],
    },
    expectations: {
      operation: "aggregate",
      metric: "hospital-count",
      filterCount: 0,
      hasGrouping: true,
      hasOrdering: false,
      hasLimit: true,
    },
  },
  {
    id: "MAP-3",
    description: "Lookup query",
    queryPlan: {
      semantic: {
        metrics: [
          {
            phrase: "hospital list",
            canonicalKey: "hospital-list",
            semanticType: "metric",
            definition: {
              id: "hospital-list",
              name: "hospital-list",
              displayName: "Hospital List",
            },
            confidence: 1,
            start: 0,
            end: 0,
          } as SemanticCandidate,
        ],
        entities: [
          {
            phrase: "texas",
            canonicalKey: "state",
            semanticType: "entity",
            definition: {
              id: "state",
              name: "state",
              displayName: "State",
              execution: { parameter: "state" },
            },
            confidence: 1,
            start: 0,
            end: 0,
            resolvedValue: "TX",
          } as SemanticCandidate,
        ],
        dimensions: [],
        categories: [],
        benchmarks: [],
        relationships: [],
      },
      intent: "lookup",
      parameters: { state: "TX" },
      filters: [],
    },
    expectations: {
      operation: "lookup",
      metric: "hospital-list",
      filterCount: 1,
      hasGrouping: false,
      hasOrdering: false,
      hasLimit: true,
    },
  },
  {
    id: "MAP-4",
    description: "Comparison query with benchmark",
    queryPlan: {
      semantic: {
        metrics: [
          {
            phrase: "overall rating",
            canonicalKey: "hospital-overall-rating",
            semanticType: "metric",
            definition: {
              id: "hospital-overall-rating",
              name: "hospital-overall-rating",
              displayName: "Hospital Overall Rating",
            },
            confidence: 1,
            start: 0,
            end: 0,
          } as SemanticCandidate,
        ],
        entities: [],
        dimensions: [],
        categories: [],
        benchmarks: [
          {
            phrase: "national average",
            canonicalKey: "national-average",
            semanticType: "benchmark",
            definition: {
              id: "national-average",
              metricId: "hospital-overall-rating",
              displayName: "National Average",
            },
            confidence: 1,
            start: 0,
            end: 0,
          } as SemanticCandidate,
        ],
        relationships: [
          {
            phrase: "above",
            canonicalKey: "above-comparison",
            semanticType: "relationship",
            definition: {
              id: "above-comparison",
              sourceType: "metric",
              targetType: "benchmark",
            },
            confidence: 1,
            start: 0,
            end: 0,
          } as SemanticCandidate,
        ],
      },
      intent: "comparison",
      parameters: {},
      filters: [],
    },
    expectations: {
      operation: "compare",
      metric: "hospital-overall-rating",
      filterCount: 0,
      hasGrouping: false,
      hasOrdering: false,
    },
  },
  {
    id: "MAP-5",
    description: "Ranking with dimensions (grouped ranking)",
    queryPlan: {
      semantic: {
        metrics: [
          {
            phrase: "overall rating",
            canonicalKey: "hospital-overall-rating",
            semanticType: "metric",
            definition: {
              id: "hospital-overall-rating",
              name: "hospital-overall-rating",
              displayName: "Hospital Overall Rating",
            },
            confidence: 1,
            start: 0,
            end: 0,
          } as SemanticCandidate,
        ],
        entities: [
          {
            phrase: "california",
            canonicalKey: "state",
            semanticType: "entity",
            definition: {
              id: "state",
              name: "state",
              displayName: "State",
              execution: { parameter: "state" },
            },
            confidence: 1,
            start: 0,
            end: 0,
            resolvedValue: "CA",
          } as SemanticCandidate,
        ],
        dimensions: [
          {
            phrase: "by county",
            canonicalKey: "county-dimension",
            semanticType: "dimension",
            definition: {
              id: "county-dimension",
              name: "county",
              displayName: "County",
            },
            confidence: 1,
            start: 0,
            end: 0,
          } as SemanticCandidate,
        ],
        categories: [],
        benchmarks: [],
        relationships: [],
      },
      intent: "ranking",
      parameters: { state: "CA" },
      filters: [],
    },
    expectations: {
      operation: "rank",
      metric: "hospital-overall-rating",
      filterCount: 1,
      hasGrouping: true,
      hasOrdering: true,
      orderDirection: "desc",
      hasLimit: true,
    },
  },
];

console.log("\n" + "=".repeat(80));
console.log("PHASE 5.2: EXECUTION PLAN MAPPING VERIFICATION");
console.log("=".repeat(80));

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`[${testCase.id}] ${testCase.description}`);
  console.log("=".repeat(80));

  try {
    const executionPlan = mapper.map(testCase.queryPlan);

    console.log("\nExecutionPlan:");
    console.log(JSON.stringify(executionPlan, null, 2));

    // Verify expectations
    const errors: string[] = [];

    if (
      testCase.expectations.operation &&
      executionPlan.operation !== testCase.expectations.operation
    ) {
      errors.push(
        `Operation mismatch: expected "${testCase.expectations.operation}", got "${executionPlan.operation}"`,
      );
    }

    if (
      testCase.expectations.metric &&
      executionPlan.metric !== testCase.expectations.metric
    ) {
      errors.push(
        `Metric mismatch: expected "${testCase.expectations.metric}", got "${executionPlan.metric}"`,
      );
    }

    if (
      testCase.expectations.filterCount !== undefined &&
      executionPlan.filters.length !== testCase.expectations.filterCount
    ) {
      errors.push(
        `Filter count mismatch: expected ${testCase.expectations.filterCount}, got ${executionPlan.filters.length}`,
      );
    }

    if (
      testCase.expectations.hasGrouping !== undefined &&
      !!executionPlan.grouping !== testCase.expectations.hasGrouping
    ) {
      errors.push(
        `Grouping presence mismatch: expected ${testCase.expectations.hasGrouping}, got ${!!executionPlan.grouping}`,
      );
    }

    if (
      testCase.expectations.hasOrdering !== undefined &&
      !!executionPlan.ordering !== testCase.expectations.hasOrdering
    ) {
      errors.push(
        `Ordering presence mismatch: expected ${testCase.expectations.hasOrdering}, got ${!!executionPlan.ordering}`,
      );
    }

    if (
      testCase.expectations.orderDirection &&
      executionPlan.ordering?.direction !== testCase.expectations.orderDirection
    ) {
      errors.push(
        `Order direction mismatch: expected "${testCase.expectations.orderDirection}", got "${executionPlan.ordering?.direction}"`,
      );
    }

    if (
      testCase.expectations.hasLimit !== undefined &&
      !!executionPlan.limit !== testCase.expectations.hasLimit
    ) {
      errors.push(
        `Limit presence mismatch: expected ${testCase.expectations.hasLimit}, got ${!!executionPlan.limit}`,
      );
    }

    if (errors.length > 0) {
      console.log("\n❌ FAIL");
      errors.forEach((err) => console.log(`   ${err}`));
      failed++;
    } else {
      console.log("\n✅ PASS");
      passed++;
    }
  } catch (error) {
    console.log("\n❌ ERROR");
    console.log(`   ${error}`);
    failed++;
  }
}

console.log("\n" + "=".repeat(80));
console.log("PHASE 5.2 EXECUTION MAPPING RESULTS");
console.log("=".repeat(80));
console.log(`Total: ${testCases.length}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log();

if (failed === 0) {
  console.log("✅ PHASE 5.2 EXECUTION MAPPING: ALL TESTS PASSED");
  process.exit(0);
} else {
  console.log("❌ PHASE 5.2 EXECUTION MAPPING: TESTS FAILED");
  process.exit(1);
}
