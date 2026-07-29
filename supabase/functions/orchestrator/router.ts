import type { ChatRequest } from "./types/request.ts";
import type { ChatResponse } from "./types/response.ts";

import { handleChat } from "./handlers/chat.ts";

export async function router(
  request: ChatRequest,
): Promise<ChatResponse> {
  return handleChat(request);
}