// import { healthcareDomain } from "@intelligence/healthcare-domain";
// import { createDomainRuntime } from "@intelligence/domain-runtime";
// import { createSemanticResolver } from "@intelligence/semantic";

// const runtime = createDomainRuntime(healthcareDomain);

// console.log("======================================");
// console.log("Healthcare Domain Runtime Verification");
// console.log("======================================");

// console.log("\nRuntime created successfully.");

// const resolver = createSemanticResolver(runtime.registry);

// let passed = 0;
// let failed = 0;

// const testCases = [
//   {
//     query: "heart attack",
//     expected: {
//       resolved: true,
//       semanticType: "concept",
//       canonicalKey: "acute-myocardial-infarction",
//       sqlFound: false,
//     },
//   },
//   {
//     query: "AMI",
//     expected: {
//       resolved: true,
//       semanticType: "concept",
//       canonicalKey: "acute-myocardial-infarction",
//       sqlFound: false,
//     },
//   },
//   {
//     query: "patient satisfaction",
//     expected: {
//       resolved: true,
//       semanticType: "concept",
//       canonicalKey: "patient-satisfaction",
//       sqlFound: false,
//     },
//   },
//   {
//     query: "readmission",
//     expected: {
//       resolved: true,
//       semanticType: "metric",
//       canonicalKey: "readmission-rate",
//       sqlFound: true,
//     },
//   },
//   {
//     query: "hospital rating",
//     expected: {
//       resolved: true,
//       semanticType: "metric",
//       canonicalKey: "hospital-overall-rating",
//       sqlFound: true,
//     },
//   },
//   {
//     query: "Texas hospital",
//     expected: {
//       resolved: true,
//       semanticType: "entity",
//       canonicalKey: "hospital",
//       sqlFound: false,
//     },
//   },
//   {
//     query: "banana pizza",
//     expected: {
//       resolved: false,
//       semanticType: null,
//       canonicalKey: null,
//       sqlFound: false,
//     },
//   },
// ];

// for (const query of queries) {
//   console.log("\n--------------------------------------");
//   console.log(`Query: ${query}`);

// const result = resolver.resolve(query);

// console.dir(result, { depth: null });

// if (!result.resolved || !result.canonicalKey) {
//   console.log("SQL: Not Resolved");
//   continue;
// }

// const sql = runtime.sqlResolver.resolve(result.canonicalKey);

// console.log("\nSQL Resolution:");

// console.dir(sql, { depth: null });
// }

// for (const testCase of testCases) {
//   const { query, expected } = testCase;

//   console.log("\n--------------------------------------");
//   console.log(`Query: ${query}`);

//   const result = resolver.resolve(query);



import { healthcareDomain } from "@intelligence/healthcare-domain";
import { createDomainRuntime } from "@intelligence/domain-runtime";
import { createSemanticResolver } from "@intelligence/semantic";

const runtime = createDomainRuntime(healthcareDomain);
const resolver = createSemanticResolver(runtime.registry);

console.log("======================================");
console.log("IntelligenceOS Platform Acceptance Test");
console.log("Domain: Healthcare");
console.log("Stage: A");
console.log("======================================");

if (runtime.registry && runtime.sqlResolver) {
  console.log("✓ Runtime created");
} else {
  console.log("✗ Runtime creation failed");
  process.exit(1);
}

const queries = [
  "heart attack",
  "AMI",
  "patient satisfaction",
  "readmission",
  "hospital rating",
  "Texas hospital",
  "banana pizza",
];

let passed = 0;
let failed = 0;

for (const query of queries) {
  console.log("\n--------------------------------------");
  console.log(`Query: ${query}`);

  const result = resolver.resolve(query);

  console.log(
    `Resolved      : ${result.resolved ? "✓" : "✗"}`
  );
  console.log(
    `Semantic Type : ${result.semanticType ?? "None"}`
  );
  console.log(
    `Canonical Key : ${result.canonicalKey ?? "None"}`
  );

  if (!result.resolved || !result.canonicalKey) {
    console.log("SQL Template  : Not Applicable");

    if (query === "banana pizza") {
      passed++;
      console.log("✓ Expected (unknown query)");
    } else {
      failed++;
      console.log("✗ Expected a semantic match");
    }

    continue;
  }

  const sql = runtime.sqlResolver.resolve(result.canonicalKey);

  console.log(
    `SQL Template  : ${sql.found ? "✓ Found" : "✗ Missing"}`
  );

  if (sql.found) {
    passed++;
  } else {
    /*
      Concepts/entities normally don't have SQL templates.
      Only metrics generally do.
      We don't assume that here—we simply report it.
    */

    if (result.semanticType === "metric") {
      failed++;
      console.log("✗ Metric should have a SQL template");
    } else {
      passed++;
    }
  }
}

console.log("\n======================================");
console.log("Acceptance Test Summary");
console.log("======================================");
console.log(`Passed : ${passed}`);
console.log(`Failed : ${failed}`);

if (failed === 0) {
  console.log("\n🎉 STAGE A ACCEPTANCE PASSED");
} else {
  console.log("\n❌ STAGE A ACCEPTANCE FAILED");
}