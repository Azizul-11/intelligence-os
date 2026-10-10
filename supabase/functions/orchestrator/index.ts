import { isAllowedOrigin, responseHeaders } from "../shared/cors.ts";
import { router } from "./router.ts";
import { publicErrorMessage } from "./services/sanitize-error.ts";

import type { ChatRequest } from "./types/request.ts";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_QUESTION_CHARS = 1000;
const MAX_ID_CHARS = 128;
// One domain pack is wired in services/domain-registry.ts; a request names it or omits it.
const REGISTERED_DOMAINS: readonly string[] = ["healthcare"];
const DEFAULT_DOMAIN = "healthcare";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Failure = { ok: false; status: number; error: string };

/** Reads the body with a hard ceiling, so an oversized request is dropped before it is parsed. */
async function readJsonBody(req: Request): Promise<{ ok: true; value: unknown } | Failure> {
  const declared = Number(req.headers.get("content-length"));

  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, status: 413, error: "Request body is too large." };
  }

  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (reader) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    total += value.byteLength;

    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return { ok: false, status: 413, error: "Request body is too large." };
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes)) };
  } catch {
    return { ok: false, status: 400, error: "Request body must be valid JSON." };
  }
}

const optionalText = (value: unknown, max: number): string | undefined | null =>
  value === undefined || value === null ? undefined : typeof value === "string" && value.length > 0 && value.length <= max ? value : null;

/** Only the known fields leave this function, each with its type and length checked. */
function validateChatRequest(body: unknown): { ok: true; request: ChatRequest } | Failure {
  const bad = (error: string): Failure => ({ ok: false, status: 400, error });

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return bad("Request body must be a JSON object.");
  }

  const input = body as Record<string, unknown>;

  if (typeof input.question !== "string" || input.question.trim().length < 1 || input.question.length > MAX_QUESTION_CHARS) {
    return bad(`question must be a string of 1 to ${MAX_QUESTION_CHARS} characters.`);
  }

  const domain = input.domain === undefined || input.domain === null || input.domain === "" ? DEFAULT_DOMAIN : input.domain;

  if (typeof domain !== "string" || !REGISTERED_DOMAINS.includes(domain)) {
    return bad("domain is not a registered domain.");
  }

  const sessionId = optionalText(input.sessionId, MAX_ID_CHARS);
  const userId = optionalText(input.userId, MAX_ID_CHARS);
  const continuationResponse = optionalText(input.continuationResponse, MAX_QUESTION_CHARS);

  if (sessionId === null || userId === null || continuationResponse === null) {
    return bad("sessionId, userId and continuationResponse must be non-empty strings of reasonable length.");
  }

  const pendingInteractionId = input.pendingInteractionId;

  if (pendingInteractionId !== undefined && pendingInteractionId !== null && (typeof pendingInteractionId !== "string" || !UUID.test(pendingInteractionId))) {
    return bad("pendingInteractionId must be a UUID.");
  }

  return {
    ok: true,
    request: {
      question: input.question,
      domain,
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(userId !== undefined ? { userId } : {}),
      ...(typeof pendingInteractionId === "string" ? { pendingInteractionId } : {}),
      ...(continuationResponse !== undefined ? { continuationResponse } : {}),
    },
  };
}

export default {
  fetch: async (req: Request) => {
    const origin = req.headers.get("origin");
    const headers = { ...responseHeaders(origin), "Content-Type": "application/json" };
    // The body mirrors ChatResponse, so the web client shows the message like any other failed answer.
    const reply = (status: number, error: string, extra: Record<string, string> = {}) =>
      new Response(JSON.stringify({ success: false, answer: "", error }), { status, headers: { ...headers, ...extra } });

    // A browser origin that is not on the allow-list gets nothing; non-browser callers send no Origin.
    if (origin && !isAllowedOrigin(origin)) {
      return reply(403, "Origin not allowed.");
    }

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    if (req.method !== "POST") {
      return reply(405, "Method not allowed.", { Allow: "POST, OPTIONS" });
    }

    const contentType = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();

    if (contentType !== "application/json") {
      return reply(415, "Content-Type must be application/json.");
    }

    const body = await readJsonBody(req);

    if (!body.ok) {
      return reply(body.status, body.error);
    }

    const checked = validateChatRequest(body.value);

    if (!checked.ok) {
      return reply(checked.status, checked.error);
    }

    try {
      const response = await router(checked.request);

      return new Response(JSON.stringify(response), { status: 200, headers });
    } catch (error) {
      return reply(500, publicErrorMessage(error));
    }
  },
};
