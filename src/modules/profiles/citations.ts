import type { Citation, ProfileDocument } from "./schema";

/** Looks up a rule's citation and effective date by its key, for provenance display (reports.md). */
export function findRuleCitation(
  document: ProfileDocument,
  ruleKey: string,
): { citation: Citation; effectiveOn: string } | null {
  const buffer = document.bufferRules.find((b) => b.key === ruleKey);
  if (buffer) return { citation: buffer.citation, effectiveOn: buffer.effectiveOn };

  const trigger = document.studyTriggers.find((t) => t.key === ruleKey);
  if (trigger) return { citation: trigger.citation, effectiveOn: trigger.effectiveOn };

  const tree = document.treeRules.find((t) => t.key === ruleKey);
  if (tree) return { citation: tree.citation, effectiveOn: tree.effectiveOn };

  return null;
}
