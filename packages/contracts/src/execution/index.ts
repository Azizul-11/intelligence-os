/**
 * Universal Execution Contracts
 *
 * Phase 5.1: Establishes the ExecutionPlan contract as the bridge between
 * semantic understanding and deterministic execution.
 *
 * These contracts are domain-agnostic and represent execution structure
 * independent of SQL, Healthcare, or any specific implementation.
 */

export * from "./execution-plan";
export * from "./execution-plan-metric";
export * from "./execution-operation";
export * from "./execution-filter";
export * from "./execution-ordering";
export * from "./execution-grouping";
export * from "./execution-limit";
