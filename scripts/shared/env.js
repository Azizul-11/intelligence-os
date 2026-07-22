// import dotenv from "dotenv";
// dotenv.config({
//   path: ".env",
// });
// function getEnv(name: string): string {
//   const value = process.env[name];
//   if (!value) {
//     throw new Error(`Missing environment variable: ${name}`);
//   }
//   return value;
// }
// export const env = {
//   supabaseUrl: getEnv("SUPABASE_URL"),
//   supabaseAnonKey: getEnv("SUPABASE_ANON_KEY"),
//   supabaseServiceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
// };
import dotenv from "dotenv";
dotenv.config({
    path: ".env",
});
function getEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing environment variable: ${name}`);
    }
    return value;
}
export const env = {
    supabaseUrl: getEnv("SUPABASE_URL"),
    supabaseAnonKey: getEnv("SUPABASE_ANON_KEY"),
    supabaseServiceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY"),
};
//# sourceMappingURL=env.js.map