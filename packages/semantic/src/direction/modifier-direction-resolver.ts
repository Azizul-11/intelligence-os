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

  /**
   * Classifies a direction directly from a piece of arbitrary text (e.g.
   * a domain's lexical-rewrite rule pattern, such as "worst hospitals")
   * by checking whether any of its words is a recognized superlative
   * modifier - no span or token-distance logic, no candidate-phrase
   * search.
   *
   * Used when a candidate's own phrase cannot be located in the
   * original text at all - a fallback/rewrite-derived candidate, whose
   * phrase only exists after the rewrite ran (see RCG-020) - so the
   * ordinary resolve() method's span-based approach can never apply.
   * Generic, domain-agnostic: the caller supplies arbitrary text: this
   * method never inspects domain or metric identity.
   */
  resolveFromText(text: string): Direction | undefined {
    const words = text.split(" ").filter(Boolean);

    for (const word of words) {
      if (DESCENDING_MODIFIERS.has(word)) {
        return "desc";
      }

      if (ASCENDING_MODIFIERS.has(word)) {
        return "asc";
      }
    }

    return undefined;
  }

  /**
   * RCG-010: detects a genuine direction contradiction - both an
   * ascending and a descending modifier present among the given
   * indices - as distinct from a legitimate "from X to Y" range/order
   * expression (e.g. "rank hospitals from best to worst"), which is
   * not a contradiction and must be left alone.
   *
   * Domain-agnostic and candidate-agnostic: only ever inspects the
   * existing generic ASCENDING_MODIFIERS/DESCENDING_MODIFIERS sets and
   * the ordinary English words "from"/"to" - never a domain-specific
   * word, never a regex. Callers are responsible for first confirming
   * this check should even apply (see SemanticPipeline: only when the
   * query names exactly one distinct metric - a genuine cross-metric
   * query, e.g. "highest rating and lowest mortality", legitimately
   * carries an ascending and a descending modifier for two DIFFERENT
   * candidates, which is not a contradiction and must never reach this
   * method at all).
   *
   * The range/order exemption is intentionally narrow: exactly one
   * ascending and one descending modifier, with "from" immediately
   * preceding whichever comes first in the text and "to" immediately
   * preceding whichever comes second. Any other shape (three or more
   * conflicting modifiers, or two conflicting modifiers not connected
   * by "from ... to ...") is reported as a contradiction rather than
   * guessed at.
   */
  detectContradiction(
    originalTokens: readonly string[],
    modifierTokenIndices: readonly number[],
  ): { ascendingWord: string; descendingWord: string } | undefined {
    const ascendingIndices = modifierTokenIndices.filter((index) =>
      ASCENDING_MODIFIERS.has(originalTokens[index] ?? ""),
    );

    const descendingIndices = modifierTokenIndices.filter((index) =>
      DESCENDING_MODIFIERS.has(originalTokens[index] ?? ""),
    );

    if (ascendingIndices.length === 0 || descendingIndices.length === 0) {
      return undefined;
    }

    if (ascendingIndices.length === 1 && descendingIndices.length === 1) {
      const sorted = [ascendingIndices[0]!, descendingIndices[0]!].sort(
        (a, b) => a - b,
      );
      const firstIndex = sorted[0]!;
      const secondIndex = sorted[1]!;

      if (
        originalTokens[firstIndex - 1] === "from" &&
        originalTokens[secondIndex - 1] === "to"
      ) {
        return undefined;
      }
    }

    return {
      ascendingWord: originalTokens[ascendingIndices[0]!]!,
      descendingWord: originalTokens[descendingIndices[0]!]!,
    };
  }
}
