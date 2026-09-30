/** A field/direction sort spec. */
export interface QuerySort {
  field: string;

  direction: "asc" | "desc";
}