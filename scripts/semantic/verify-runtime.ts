import { healthcareDomain } from "@intelligence/healthcare-domain";
import { createDomainRuntime } from "@intelligence/domain-runtime";
import { createSemanticResolver } from "@intelligence/semantic";

const runtime = createDomainRuntime(healthcareDomain);

console.log("======================================");
console.log("Healthcare Domain Runtime Verification");
console.log("======================================");

console.log("\nRuntime created successfully.");

const resolver = createSemanticResolver(runtime.registry);

const queries = [
  "heart attack",
  "AMI",
  "patient satisfaction",
  "readmission",
  "hospital rating",
  "Texas hospital",
  "banana pizza",
];

for (const query of queries) {
  console.log("\n--------------------------------------");
  console.log(`Query: ${query}`);

const result = resolver.resolve(query);

console.dir(result, { depth: null });

if (!result.resolved || !result.canonicalKey) {
  console.log("SQL: Not Resolved");
  continue;
}

const sql = runtime.sqlResolver.resolve(result.canonicalKey);

console.log("\nSQL Resolution:");

console.dir(sql, { depth: null });
}