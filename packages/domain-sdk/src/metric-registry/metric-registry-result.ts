/** Outcome of a MetricRegistry register/unregister call. */
export interface MetricRegistryResult {
  success: boolean;

  message?: string;
}