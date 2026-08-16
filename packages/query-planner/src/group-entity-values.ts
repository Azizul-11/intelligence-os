/**
 * Phase 7.5.3 - Generic multi-entity value grouping.
 *
 * Groups a sequence of (key, value) pairs by key, deduplicating values
 * that are identical, while preserving first-seen order for both the
 * keys and the values within each key's group.
 *
 * This is the smallest generic building block needed to stop multiple
 * resolved entities that share the same execution parameter name from
 * silently overwriting one another (the previous behavior was a plain
 * `object[key] = value` assignment inside a loop, which only ever kept
 * the last value seen).
 *
 * Domain-agnostic: operates purely on generic keys/values supplied by
 * the caller. Contains no knowledge of what a "key" or "value" means to
 * any particular domain.
 */
export function groupEntityValues<T>(
  entries: Iterable<{ key: string; value: T }>,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();

  for (const { key, value } of entries) {
    const existing = grouped.get(key);

    if (existing) {
      if (!existing.includes(value)) {
        existing.push(value);
      }
    } else {
      grouped.set(key, [value]);
    }
  }

  return grouped;
}
