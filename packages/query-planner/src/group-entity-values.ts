/** Phase 7.5.3: groups (key, value) pairs by key, deduplicating values, so multiple entities sharing a parameter don't overwrite each other. */
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
