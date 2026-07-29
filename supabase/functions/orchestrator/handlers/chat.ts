import type { ChatRequest } from "../types/request.ts";
import type { ChatResponse } from "../types/response.ts";

import { executeRuntime } from "../services/runtime.ts";

export async function handleChat(
  request: ChatRequest,
): Promise<ChatResponse> {
  const result = await executeRuntime(request);

  if (!result.success) {
    return {
      success: false,
      answer: "",
      error: result.error,
    };
  }

  return {
    success: true,
    answer: JSON.stringify(result.rows, null, 2),
    metadata: {
      rowCount: result.rowCount,
    },
  };
}