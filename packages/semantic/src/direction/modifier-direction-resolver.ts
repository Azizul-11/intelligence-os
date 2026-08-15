import type { Direction } from "./direction";
import {
  ASCENDING_MODIFIERS,
  DESCENDING_MODIFIERS,
} from "./modifier-direction-lexicon";

interface Span {
  start: number;
  end: number;
}

/**
 * Associates a candidate phrase with the nearest English superlative
 * modifier token ("highest", "lowest", "best", ...), by plain token-index
 * distance — no regex, no domain vocabulary.
 *
 * Operates over the ORIGINAL (pre-rewrite) token sequence, since the
 * pipeline's LexicalRewriter strips modifier words before phrase
 * extraction runs. The candidate's own phrase is located within that
 * original sequence via a literal, sequential subsequence search (not a
 * regex) — this also means a candidate whose phrase only exists after a
 * lexical rewrite (e.g. a hardcoded Healthcare phrase substitution) will
 * simply not be found, and this resolver returns `undefined`, leaving the
 * caller to fall back to whatever direction signal it already has.
 *
 * Generic, domain-agnostic: usable unchanged by any Domain SDK.
 */
export class ModifierDirectionResolver {
  resolve(
    originalTokens: readonly string[],
    modifierTokenIndices: readonly number[],
    candidatePhrase: string,
  ): Direction | undefined {
    if (modifierTokenIndices.length === 0) {
      return undefined;
    }

    const phraseWords = candidatePhrase.split(" ").filter(Boolean);

    if (phraseWords.length === 0) {
      return undefined;
    }

    const span = this.findSpan(originalTokens, phraseWords);

    if (!span) {
      return undefined;
    }

    const nearestIndex = this.findNearestModifier(modifierTokenIndices, span);

    if (nearestIndex === undefined) {
      return undefined;
    }

    const modifierWord = originalTokens[nearestIndex];

    if (!modifierWord) {
      return undefined;
    }

    if (DESCENDING_MODIFIERS.has(modifierWord)) {
      return "desc";
    }

    if (ASCENDING_MODIFIERS.has(modifierWord)) {
      return "asc";
    }

    return undefined;
  }

  /**
   * Finds the first contiguous occurrence of `words` within `tokens`.
   * Plain sequential array comparison — no regex.
   */
  private findSpan(
    tokens: readonly string[],
    words: readonly string[],
  ): Span | undefined {
    for (let start = 0; start <= tokens.length - words.length; start++) {
      let matched = true;

      for (let offset = 0; offset < words.length; offset++) {
        if (tokens[start + offset] !== words[offset]) {
          matched = false;
          break;
        }
      }

      if (matched) {
        return { start, end: start + words.length - 1 };
      }
    }

    return undefined;
  }

  /**
   * Finds the modifier token index nearest to `span` by absolute token
   * distance. On an exact tie, prefers the modifier preceding the span
   * (English convention: a superlative modifier typically precedes the
   * noun phrase it modifies, e.g. "best rating", "lowest mortality").
   */
  private findNearestModifier(
    modifierTokenIndices: readonly number[],
    span: Span,
  ): number | undefined {
    let best: { index: number; distance: number; precedes: boolean } | undefined;

    for (const modifierIndex of modifierTokenIndices) {
      let distance: number;
      let precedes: boolean;

      if (modifierIndex < span.start) {
        distance = span.start - modifierIndex;
        precedes = true;
      } else if (modifierIndex > span.end) {
        distance = modifierIndex - span.end;
        precedes = false;
      } else {
        // Modifier index falls inside the candidate's own span - skip.
        continue;
      }

      const isCloser = best === undefined || distance < best.distance;
      const isTieButPrecedes =
        best !== undefined && distance === best.distance && precedes && !best.precedes;

      if (isCloser || isTieButPrecedes) {
        best = { index: modifierIndex, distance, precedes };
      }
    }

    return best?.index;
  }
}
