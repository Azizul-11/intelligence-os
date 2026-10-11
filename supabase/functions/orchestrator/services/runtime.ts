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

  const pinned = request.compare;

  return engine.execute({
    question: request.question,
    parameters: {},
    requestId,
    // A picked comparison pins its records by identity through the same fields a clarification's Turn 2 uses; every gate still runs.
    ...(pinned
      ? {
          companionEntities: pinned.values.map((value) => ({ value, canonicalKey: pinned.entityId })),
          forcedIntent: "comparison" as const,
          identityAlreadyResolved: true,
        }
      : {}),
    // Tier1 Task 6: the top-level Turn 1 entry point, where fresh questions get dry-run-validated suggestions (RuntimeRequest.includeSuggestions).
    includeSuggestions: true,
    ...(onResult ? { onResult } : {}),
  });
}