import { buildCorsHeaders } from "../shared/cors.ts";
import { router } from "./router.ts";

import type { ChatRequest } from "./types/request.ts";

export default {
  fetch: async (req: Request) => {
    const corsHeaders = buildCorsHeaders;

    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    try {
      const body = (await req.json()) as ChatRequest;

      const response = await router(body);

      return new Response(JSON.stringify(response), {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      console.error("[Error caught in index.ts]", error);
      return new Response(
        JSON.stringify({
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Internal Server Error",
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }
  },
};
