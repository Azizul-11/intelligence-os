// import { getRuntimeEngine } from "./domain-registry.ts";

// import type { ChatRequest } from "../types/request.ts";

// import type { RuntimeResult } from "@intelligence/runtime-engine";

// export async function executeRuntime(
//   request: ChatRequest,
// ): Promise<RuntimeResult> {
//   const engine = getRuntimeEngine(request.domain);

//   if (!engine) {
//     return {
//       success: false,
//       rows: [],
//       rowCount: 0,
//       error: `Unknown domain: ${request.domain}`,
//     };
//   }

//   return engine.execute({
//     question: request.question,
//     parameters: {},
//   });
// }

import type { ChatRequest } from "../types/request.ts";

export async function executeRuntime(_request: ChatRequest) {
  return {
    success: true,
    rows: [],
    rowCount: 0,
  };
}