// stage-a-demo.ts is a tiny entry point that wires everything together.

import { DemoRunner } from "./demo-runner";
import { demoScenarios } from "./demo-scenarios";

async function main() {
  console.clear();

  console.log("");
  console.log("========================================");
  console.log(" IntelligenceOS");
  console.log(" Stage A Demonstration");
  console.log("========================================");

  const runner = new DemoRunner();

  for (const scenario of demoScenarios) {
    await runner.runScenario(scenario);
  }

  console.log("");
  console.log("========================================");
  console.log(" Stage A Demonstration Complete");
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});