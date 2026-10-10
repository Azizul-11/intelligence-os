/** Raw database or driver text names tables and columns and helps nobody; it is logged and replaced before it reaches a user. */
const RAW_DATABASE_ERROR =
  /\b(relation|column|table|function|schema|role)\b[^.]*\bdoes not exist\b|syntax error|permission denied|violates .*constraint|invalid input syntax|SQLSTATE|PGRST\d+|canceling statement|statement timeout|deadlock detected|duplicate key|^Missing required parameter/i;

export const DATABASE_ERROR_MESSAGE =
  "I couldn't retrieve that from the data source. You can ask about a hospital's overall rating, mortality, readmissions or patient experience.";

export function sanitizeDatabaseError(error: string | undefined): string | undefined {
  if (!error || !RAW_DATABASE_ERROR.test(error)) {
    return error;
  }

  console.error("[Raw database error withheld from the user]", error);
  return DATABASE_ERROR_MESSAGE;
}
