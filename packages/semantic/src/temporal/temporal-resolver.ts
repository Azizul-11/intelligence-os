import type { Token } from "../tokenizer";
import type { TemporalCandidate } from "./temporal-candidate";

/** Domain-agnostic sanity range for a literal year; not a calendar library. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/** Phase 8.6A: recognizes a literal point-year ("2021") as a TemporalCandidate by token shape only (four digits in range); ranges and relative dates are deliberately unrecognized. */
export class TemporalResolver {
  resolve(tokens: readonly Token[]): TemporalCandidate[] {
    const candidates: TemporalCandidate[] = [];

    for (const token of tokens) {
      if (token.value.length !== 4) {
        continue;
      }

      const value = Number(token.value);

      if (Number.isNaN(value) || !Number.isInteger(value)) {
        continue;
      }

      if (value < MIN_YEAR || value > MAX_YEAR) {
        continue;
      }

      candidates.push({
        kind: "year",
        value,
        span: { start: token.position, end: token.position },
      });
    }

    return candidates;
  }
}
