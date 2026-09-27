// TechDesign/research-phases.md R10: "what changed" is the sentences added and the sentences removed
// between two drafted summaries. A comparison of two lists, with no judgment in it.

export type LineDiff = { added: string[]; removed: string[] };

/**
 * Multiset difference: a sentence that appears twice before and once after counts as one removed. The
 * order of `added` follows `current`, and the order of `removed` follows `previous`, so the same two
 * summaries always give the same diff.
 */
export function diffLines(previous: string[], current: string[]): LineDiff {
  const remaining = new Map<string, number>();
  for (const line of previous) remaining.set(line, (remaining.get(line) ?? 0) + 1);

  const added: string[] = [];
  for (const line of current) {
    const count = remaining.get(line) ?? 0;
    if (count > 0) remaining.set(line, count - 1);
    else added.push(line);
  }

  const removed: string[] = [];
  for (const line of previous) {
    const count = remaining.get(line) ?? 0;
    if (count > 0) {
      removed.push(line);
      remaining.set(line, count - 1);
    }
  }
  return { added, removed };
}
