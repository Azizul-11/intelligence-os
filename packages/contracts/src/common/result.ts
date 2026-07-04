/**
 * Generic successful result.
 */
export interface SuccessResult<T> {
  success: true;
  data: T;
}

/**
 * Generic failed result.
 */
export interface ErrorResult {
  success: false;
  error: string;
}

/**
 * Platform result type.
 */
export type Result<T> = SuccessResult<T> | ErrorResult;