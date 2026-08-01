import { getRuntimeEngine } from "./domain-registry.ts";

import type { ChatRequest } from "../types/request.ts";

import type { RuntimeResult } from "@intelligence/runtime-engine";

// export async function executeRuntime(
//   request: ChatRequest,
// ): Promise<RuntimeResult> {
//   const engine = getRuntimeEngine();

//   return engine.execute({
//     question: request.question,
//     parameters: {},
//   });
// }


export async function executeRuntime(
  request: ChatRequest,
): Promise<RuntimeResult> {
  console.log(">>> executeRuntime");

  const engine = getRuntimeEngine();

  console.log(">>> got runtime engine");

  return engine.execute({
    question: request.question,
    parameters: {},
  });
}