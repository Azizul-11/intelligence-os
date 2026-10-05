import type { Direction } from "./direction";
import {
  ASCENDING_MODIFIERS,
  DESCENDING_MODIFIERS,
  PERFORMANCE_MODIFIERS,
  type DirectionBasis,
} from "./modifier-direction-lexicon";

interface Span {
  start: number;
  end: number;
}

/** Batch 3 (D1): a modifier's direction plus its kind (performance or magnitude). */
export interface ResolvedDirection {
  direction: Direction;
  basis: DirectionBasis;
}

function classifyModifier(word: string): ResolvedDirection | undefined {
  const direction: Direction | undefined = DESCENDING_MODIFIERS.has(word)
    ? "desc"
    : ASCENDING_MODIFIERS.has(word)
      ? "asc"
      : undefined;

  if (direction === undefined) {
    return undefined;
  }

  return { direction, basis: PERFORMANCE_MODIFIERS.has(word) ? "performance" : "magnitude" };
}

/** Associates a candidate phrase with the nearest superlative modifier by token distance over the ORIGINAL (pre-rewrite) tokens; a phrase that exists only after a rewrite is not found and yields `undefined`. */
export class ModifierDirectionResolver {
  resolve(
    originalTokens: readonly string[],
    modifierTokenIndices: readonly number[],
    candidatePhrase: string,
  ): Direction | undefined {
    return this.resolveDetailed(originalTokens, modifierTokenIndices, candidatePhrase)?.direction;
  }

  /** Same association as resolve(), also reporting which kind of modifier word it found (Batch 3, D1). */
  resolveDetailed(
    originalTokens: readonly string[],
    modifierTokenIndices: readonly number[],
    candidatePhrase: string,
  ): ResolvedDirection | undefined {
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

    return classifyModifier(modifierWord);
  }

  /** First contiguous occurrence of `words` within `tokens` (no regex). */
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

  /** Nearest modifier index to `span` by token distance; on a tie prefers the preceding modifier. */
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

  /** Classifies direction from arbitrary text (e.g. a rewrite rule pattern) with no span search; used when a rewrite-derived candidate's phrase is absent from the original text (RCG-020). */
  resolveFromText(text: string): Direction | undefined {
    return this.resolveFromTextDetailed(text)?.direction;
  }

  /** Same as resolveFromText(), also reporting the kind of modifier word (Batch 3, D1). */
  resolveFromTextDetailed(text: string): ResolvedDirection | undefined {
    const words = text.split(" ").filter(Boolean);

    for (const word of words) {
      const resolved = classifyModifier(word);

      if (resolved) {
        return resolved;
      }
    }

    return undefined;
  }

  /** RCG-010: detects a genuine ascending-vs-descending contradiction; exactly one of each joined as "from X to Y" is a legitimate range and exempt, any other shape is reported. Callers apply it only when the query names one distinct metric. */
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
