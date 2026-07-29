import "@supabase/functions-js/edge-runtime.d.ts";

console.log("STEP 1");

import { withSupabase } from "@supabase/server";

console.log("STEP 2");

export default {
  fetch: withSupabase({ auth: ["publishable", "secret"] }, async () => {
    console.log("STEP 3");

    return Response.json({
      ok: true,
    });
  }),
};