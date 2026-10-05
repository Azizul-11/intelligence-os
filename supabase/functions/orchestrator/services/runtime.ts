import { getRuntimeEngine } from "./domain-registry.ts";

import type { ChatRequest } from "../types/request.ts";

import type { RuntimeResult } from "@intelligence/runtime-engine";

// Superseded stub: executeRuntime once called engine.execute({ question, parameters: {} }) directly.



export async function executeRuntime(
  request: ChatRequest,
  requestId?: string,
  // Batch 5A-1: called with the answer before the suggestions are built, so the summary can start meanwhile.
  onResult?: (result: RuntimeResult) => void,
): Promise<RuntimeResult> {
  console.log(">>> executeRuntime");

  const engine = getRuntimeEngine();

  console.log(">>> got runtime engine");

  return engine.execute({
    question: request.question,
    parameters: {},
    requestId,
    // Tier1 Task 6: the top-level Turn 1 entry point, where fresh questions get dry-run-validated suggestions (RuntimeRequest.includeSuggestions).
    includeSuggestions: true,
    ...(onResult ? { onResult } : {}),
  });
}