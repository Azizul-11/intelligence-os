import dotenv from "dotenv";

const result = dotenv.config();

console.log("dotenv result:", result);
console.log("cwd:", process.cwd());
console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("SERVICE_ROLE:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);