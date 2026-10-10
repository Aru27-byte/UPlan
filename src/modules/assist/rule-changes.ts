import { ProfileDocumentSchema, type ProfileDocument } from "@/modules/profiles";
import { ValidationError } from "@/platform/errors";

import type { RuleValue } from "./request";

// TechDesign/ai-assist.md, K8 and PR1. A rule draft changes a number a rule owns and nothing else: never a
// setting the planners chose (vesting, map status, records, export formats), never a rule's dates, never a
// new or removed rule. The path names the rule by its key and the one field it may change.

type Collection = "bufferRules" | "studyTriggers" | "treeRules";

const OWNED_FIELDS: Record<Collection, readonly string[]> = {
  bufferRules: ["widthFt"],
  studyTriggers: ["withinFt"],
  treeRules: ["minDbhIn", "maxCount", "periodYears"],
};

const PATH = /^(bufferRules|studyTriggers|treeRules)\.([a-z][a-z0-9-]*)\.([A-Za-z]+)$/;

export type RulePath = { collection: Collection; key: string; field: string };

/** Null for any path that is not a rule-owned numeric field: that is a rejection, never a guess at what was meant. */
export function parseRulePath(path: string): RulePath | null {
  const m = PATH.exec(path);
  if (!m) return null;
  const [, collection, key, field] = m;
  if (collection !== "bufferRules" && collection !== "studyTriggers" && collection !== "treeRules") return null;
  if (key === undefined || field === undefined) return null;
  return OWNED_FIELDS[collection].includes(field) ? { collection, key, field } : null;
}

type Entry = { key: string; repealedOn: string | null } & Record<string, unknown>;

function entriesOf(doc: ProfileDocument, collection: Collection): Entry[] {
  return doc[collection];
}

/** Every rule-owned number of every rule in force (not repealed), as the paths a draft may name. */
export function ruleValuesOf(doc: ProfileDocument): RuleValue[] {
  const values: RuleValue[] = [];
  for (const collection of Object.keys(OWNED_FIELDS) as Collection[]) {
    for (const entry of entriesOf(doc, collection)) {
      if (entry.repealedOn !== null) continue;
      for (const field of OWNED_FIELDS[collection]) {
        const value = entry[field];
        if (typeof value === "number") values.push({ path: `${collection}.${entry.key}.${field}`, value });
      }
    }
  }
  return values.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export type RuleChange = { path: string; to: number };

/**
 * Applies value changes to a document and validates the result. With `effective` null the value is replaced in
 * place, which is only used to check a draft is valid; with it, the rule in force ends on that date and a new
 * entry with the new value and the staff member's ordinance starts on it, which is how the profile versions a rule.
 */
export function applyRuleChanges(
  base: ProfileDocument,
  changes: RuleChange[],
  effective: { effectiveOn: string; ordinance: string } | null,
): ProfileDocument {
  const doc: ProfileDocument = structuredClone(base);
  const seen = new Set<string>();
  for (const change of changes) {
    const parsed = parseRulePath(change.path);
    if (!parsed) throw new ValidationError(`"${change.path}" is not a number a rule owns.`);
    if (seen.has(change.path)) throw new ValidationError(`"${change.path}" is changed twice.`);
    seen.add(change.path);

    const entries = entriesOf(doc, parsed.collection);
    const entry = entries.find((e) => e.key === parsed.key && e.repealedOn === null && typeof e[parsed.field] === "number");
    if (!entry) throw new ValidationError(`No rule in force has the number "${change.path}".`);

    if (effective === null) {
      entry[parsed.field] = change.to;
      continue;
    }
    if (effective.effectiveOn <= String(entry.effectiveOn)) {
      throw new ValidationError(`The new value of "${change.path}" must take effect after ${String(entry.effectiveOn)}, when the rule it replaces began.`);
    }
    const next = structuredClone(entry);
    next[parsed.field] = change.to;
    next.effectiveOn = effective.effectiveOn;
    next.repealedOn = null;
    const citation = next.citation;
    if (typeof citation === "object" && citation !== null) next.citation = { ...citation, ordinance: effective.ordinance };
    entry.repealedOn = effective.effectiveOn;
    entries.push(next);
  }
  const result = ProfileDocumentSchema.safeParse(doc);
  if (!result.success) {
    throw new ValidationError(`The changed profile is not valid: ${result.error.issues.map((i) => i.message).join("; ")}`);
  }
  return result.data;
}
