/** Tells the platform which execution parameter this entity populates (e.g. "state", "hospital"). No SQL/domain knowledge. */
export interface EntityExecution {
  parameter: string;
}