import { ValidationError } from "@/platform/errors";

import type { BufferRule, ProfileDocument, ResourceType, RuleSet, StudyTrigger, TreeRule } from "./schema";

// TechDesign/jurisdiction-profile.md — the one function every caller uses to resolve "the rules"
// for a date. `today` is always the caller's injected clock, never Date.now() directly
// (.claude/rules/conventions.md).

export function ruleSetResolutionDate(
  document: ProfileDocument,
  ruleSet: RuleSet,
  today: string,
  filedOn: string | null,
): string {
  const setting = document.settings.vesting.find((v) => v.ruleSet === ruleSet);
  if (!setting) throw new ValidationError(`profile has no vesting setting for rule set "${ruleSet}"`);
  if (!setting.vests) return today;
  if (filedOn === null) {
    throw new ValidationError(`rule set "${ruleSet}" vests, but this decision has no application_filed_on`);
  }
  return filedOn; // assumed per TechDesign/system-architecture.md's round-10 table
}

export type InForceRules = {
  resourceTypes: ResourceType[];
  bufferRules: BufferRule[];
  studyTriggers: StudyTrigger[];
  treeRules: TreeRule[];
};

function inForceOn(entry: { effectiveOn: string; repealedOn: string | null }, onDate: string): boolean {
  return entry.effectiveOn <= onDate && (entry.repealedOn === null || onDate < entry.repealedOn);
}

export function resolveRulesInForce(
  document: ProfileDocument,
  today: string,
  filedOn: string | null,
): { resolvedFor: Record<RuleSet, string>; rules: InForceRules } {
  const resolvedFor: Record<RuleSet, string> = {
    "critical-areas": ruleSetResolutionDate(document, "critical-areas", today, filedOn),
    trees: ruleSetResolutionDate(document, "trees", today, filedOn),
  };

  const ruleSetOf = (resourceTypeKey: string): RuleSet => {
    const rt = document.resourceTypes.find((r) => r.key === resourceTypeKey);
    if (!rt) throw new ValidationError(`no resource type "${resourceTypeKey}"`);
    return rt.ruleSet;
  };

  return {
    resolvedFor,
    rules: {
      // ResourceType has no effectiveOn/repealedOn (data-model.md, schema.ts) — a resource type
      // exists or doesn't in the document; it isn't itself something that comes in and out of
      // force. Only bufferRules/studyTriggers/treeRules carry the `...inForce` fields.
      resourceTypes: document.resourceTypes,
      bufferRules: document.bufferRules.filter((b) => inForceOn(b, resolvedFor[ruleSetOf(b.resourceType)])),
      studyTriggers: document.studyTriggers.filter((t) =>
        inForceOn(t, resolvedFor[ruleSetOf(t.resourceType)]),
      ),
      treeRules: document.treeRules.filter((t) => inForceOn(t, resolvedFor.trees)),
    },
  };
}
