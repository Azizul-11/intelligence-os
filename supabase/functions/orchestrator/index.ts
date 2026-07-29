// // import { serve } from "https://deno.land/std/http/server.ts";

// // import { buildCorsHeaders } from "../shared/cors.ts";
// // import { router } from "./router.ts";

// // import type { ChatRequest } from "./types/request.ts";

// // serve(async (req) => {
// //   const corsHeaders = buildCorsHeaders();

// //   if (req.method === "OPTIONS") {
// //     return new Response(null, {
// //       headers: corsHeaders,
// //     });
// //   }

// //   try {
// //     const body = (await req.json()) as ChatRequest;

// //     const response = await router(body);

// //     return new Response(JSON.stringify(response), {
// //       status: 200,
// //       headers: {
// //         ...corsHeaders,
// //         "Content-Type": "application/json",
// //       },
// //     });
// //   } catch (error) {
// //     return new Response(
// //       JSON.stringify({
// //         success: false,
// //         error:
// //           error instanceof Error
// //             ? error.message
// //             : "Internal Server Error",
// //       }),
// //       {
// //         status: 500,
// //         headers: {
// //           ...corsHeaders,
// //           "Content-Type": "application/json",
// //         },
// //       },
// //     );
// //   }
// // });


// import { serve } from "https://deno.land/std/http/server.ts";

// serve(() => {
//   return new Response("hello");
// });



import { serve } from "https://deno.land/std/http/server.ts";

import { buildCorsHeaders } from "../shared/cors.ts";
import { router } from "./router.ts";

import type { ChatRequest } from "./types/request.ts";

serve(async (req) => {
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
});