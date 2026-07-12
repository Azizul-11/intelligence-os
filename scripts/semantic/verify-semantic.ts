import { healthcareDomain } from "../../domain-packs/healthcare/src";

import { loadSemanticDomain } from "./semantic-loader";

async function main() {
  const report = await loadSemanticDomain(
    healthcareDomain,
  );

  console.table(report);

  console.log("✓ Semantic Registry Healthy");
}

main().catch((error) => {
  console.error(error);

  process.exit(1);
});