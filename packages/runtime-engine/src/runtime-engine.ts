import type { RuntimeRequest } from "./runtime-request";
import type { RuntimeResult } from "./runtime-result";

export interface RuntimeEngine {
  execute(
    request: RuntimeRequest,
  ): Promise<RuntimeResult>;
}