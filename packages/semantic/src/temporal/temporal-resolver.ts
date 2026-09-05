import type { Token } from "../tokenizer";
import type { TemporalCandidate } from "./temporal-candidate";

/**
 * Bounded, domain-agnostic sanity range for a literal year - not a
 * calendar/date library, not "today"-relative reasoning. Wide enough to
 * cover any domain's plausible historical/reporting data without
 * embedding any Healthcare-specific fact.
 */
const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

/**
 * Phase 8.6A: recognizes a literal point-year value (e.g. "2021") as a
 * TemporalCandidate, independent of any registry/alias lookup - a
 * literal year is user-supplied and open-ended, not a Domain-declared
 * vocabulary entry. Never inspects surrounding words, metric names, or
 * any domain-specific text; keys only on a token's own shape (exactly
 * four digits, within a bounded sane range). Deliberately narrow: does
 * not recognize ranges, relative dates ("last year"), or any form
 * beyond a single literal year - those remain unrecognized rather than
 * guessed.
 */
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
