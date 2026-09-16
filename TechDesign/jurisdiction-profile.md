# TechDesign — Jurisdiction Profile

**Feature:** F1 · `profiles`
**Status:** Draft
**Requirements:** [Requirements/jurisdiction-profile.md](../Requirements/jurisdiction-profile.md) (R1–R11)
**Builds on:** [data-model.md](data-model.md) (`jurisdiction`, `profile_version`, _The profile document_), [system-architecture.md](system-architecture.md) (_Rules in force_, D6)
**Shared module with:** [profile-upload-edit.md](profile-upload-edit.md) (F17 — proposing, previewing, and approving a change)
**Release:** 1

## Module

```
src/modules/profiles/
  index.ts            public API — schema, rulesInForce, jurisdiction and version reads
  tables.ts            jurisdiction, profile_version Drizzle tables (profile_change, profile_upload live here too — see F17's doc)
  schema.ts             ProfileDocumentSchema and checkProfileDocument (the full schema)
  rules-in-force.ts     resolveRulesInForce, ruleSetResolutionDate
  jurisdiction.ts        createJurisdiction, getJurisdiction
  versions.ts            getCurrentProfile, getProfileVersion
  *.test.ts              unit tests (schema, rules-in-force) + Testcontainers tests (jurisdiction, versions)
```

## The profile document (R1, R2, R6, R11)

`data-model.md`'s _The profile document_ section gives the shape and states this doc owns the full schema. Completing it for Sammamish's six critical area types plus tree rules:

```ts
// schema.ts — extends the shape already fixed in data-model.md
export const CRITICAL_AREA_RESOURCE_TYPES = [
  "wetlands",
  "streams",
  "frequently-flooded-areas",
  "geologically-hazardous-areas",
  "habitat-conservation-areas",
  "migration-corridors",
  "critical-aquifer-recharge-areas",
] as const; // ruleSet: "critical-areas" — the six types the charter names, split where the
// round-4 mapping names two distinct resource types (habitat areas, migration corridors)

// "forest-canopy" is the one resourceType in ruleSet "trees" (charter: forest and canopy ->
// significant-tree rules). Its own TreeRule entries (significant-tree, removal-cap) are separate
// from ResourceType/BufferRule/StudyTrigger, because trees are regulated per-trunk, not per-mapped-area.
```

- **R1/R2** are enforced by the `Citation` and `inForce` shapes already fixed in `data-model.md` — every `BufferRule`, `StudyTrigger`, and `TreeRule` entry requires them; there is no rule shape without a citation and an effective date.
- **R6, what's configuration vs. code:** a second city adds/removes/reprices `ResourceType`, `BufferRule`, `StudyTrigger`, and `TreeRule` _entries_ freely — that's the profile document, pure data. What's fixed in `schema.ts` (code, not configuration) is the small set of _shapes_ those entries can take: a buffer is always "a width in feet, conditional on one attribute equaling one value"; a study trigger is always "a distance that requires one of three named studies"; a tree rule is always "a DBH threshold" or "a removal cap." A rule that doesn't fit one of those shapes — for example, a stormwater detention volume requirement — needs a new discriminated-union member in `schema.ts`, which is a TechDesign change to this doc, not a profile edit. This is the concrete, stated limit R6 asks for.
- **R11**, `checkProfileDocument` (a `superRefine`, exactly as sketched in `data-model.md`) rejects: a repeated `resourceTypes[].key`; a `bufferRules`/`studyTriggers[].resourceType` naming a key not in `resourceTypes`; two entries sharing a rule `key` both in force on the same day (`effectiveOn <= d < (repealedOn ?? +Infinity)` overlapping); a `repealedOn` not strictly after its `effectiveOn`; and `settings.vesting`/`settings.retention` missing an entry for any `RuleSet`/record type — nothing is implied by an absent setting (R4 in this doc's Requirements).

## `jurisdiction` (R2, R7)

```sql
-- from data-model.md, unchanged
create table jurisdiction ( … current_profile_version_id uuid … );
```

```ts
// jurisdiction.ts
export async function createJurisdiction(actor: Actor, input: NewJurisdiction): Promise<Jurisdiction> {
  requireStaff(actor); // only UPlan staff create a jurisdiction; see accounts-roles.md
  return db.insert(jurisdictionTable).values(input).returning();
}

export async function getJurisdiction(actor: Actor, jurisdictionId: string): Promise<Jurisdiction> {
  const row = await db.query.jurisdiction.findFirst({ where: eq(jurisdictionTable.id, jurisdictionId) });
  if (!row) throw new NotFoundError("jurisdiction");
  requireMembership(actor, jurisdictionId); // any role
  return row;
}
```

`current_profile_version_id` starts `null` (R7: no profile exists until a first change is approved) and only ever moves inside the approval transaction that `profile-upload-edit.md` owns, under `SELECT … FOR UPDATE` on the jurisdiction row, per `system-architecture.md`'s _Concurrency and consistency_ rule 4.

## `rulesInForce` (R3, R5, R10)

```ts
// rules-in-force.ts
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
  return filedOn; // assumed per system-architecture.md's round-10 table
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
  const resolvedFor = {
    "critical-areas": ruleSetResolutionDate(document, "critical-areas", today, filedOn),
    trees: ruleSetResolutionDate(document, "trees", today, filedOn),
  };
  const ruleSetOf = (key: string) =>
    document.resourceTypes.find((r) => r.key === key)?.ruleSet ??
    (() => {
      throw new ValidationError(`no resource type "${key}"`);
    })();

  return {
    resolvedFor,
    rules: {
      // ResourceType carries no effectiveOn/repealedOn (its shape has only key/label/ruleSet/
      // mapStatus, above) — a resource type exists or doesn't in the document; only the rules
      // about it (buffers, study triggers, tree rules) come in and out of force.
      resourceTypes: document.resourceTypes,
      bufferRules: document.bufferRules.filter((b) => inForceOn(b, resolvedFor[ruleSetOf(b.resourceType)])),
      studyTriggers: document.studyTriggers.filter((t) =>
        inForceOn(t, resolvedFor[ruleSetOf(t.resourceType)]),
      ),
      treeRules: document.treeRules.filter((t) => inForceOn(t, resolvedFor.trees)),
    },
  };
}
```

- **R3, R5:** this is the one function every caller uses. `analysis` calls `resolveRulesInForce` once per run and stores `resolvedFor` verbatim as `analysis_run.rules_resolved_for` (matches the `{"critical-areas": …, "trees": …}` shape in `data-model.md`). No other module computes "is this rule in force" itself.
- Today's date is always the clock injected by the caller (`conventions.md`: "Domain logic takes today's date from an injected clock"), in the jurisdiction's `time_zone` — `rules-in-force.ts` takes `today` as a parameter, it never calls `Date.now()`.
- **R10:** `apply_effective_dates` (job J3, in `operations`/`analysis`) runs daily per jurisdiction: it computes today's and tomorrow's `resolveRulesInForce` resolution set against `document`, and for any open decision whose `application_filed_on` and vesting settings mean a rule's `effectiveOn`/`repealedOn` falls on today, enqueues `run_analysis` for it. The comparison is a plain scan of `bufferRules`/`studyTriggers`/`treeRules` dates against `today`, not a second resolution mechanism.

## Versions (R7, R8, R9)

```ts
// versions.ts
export async function getCurrentProfile(
  actor: Actor,
  jurisdictionId: string,
): Promise<ProfileVersion | null> {
  const j = await getJurisdiction(actor, jurisdictionId);
  if (!j.currentProfileVersionId) return null; // R7: no profile yet
  return getProfileVersion(actor, j.currentProfileVersionId);
}

export async function getProfileVersion(actor: Actor, versionId: string): Promise<ProfileVersion> {
  const row = await db.query.profileVersion.findFirst({ where: eq(profileVersion.id, versionId) });
  if (!row) throw new NotFoundError("profile version");
  requireMembership(actor, row.jurisdictionId);
  return row;
}

// Called by profile-upload-edit.md's approval transaction before it moves the current pointer (R9).
export function assertNoOrphanedDatasetMapping(
  newDocument: ProfileDocument,
  mappedResourceTypeKeys: string[],
): void {
  const keys = new Set(newDocument.resourceTypes.map((r) => r.key));
  const orphaned = mappedResourceTypeKeys.filter((k) => !keys.has(k));
  if (orphaned.length > 0) {
    throw new ValidationError(
      `profile change drops resource type(s) still mapped by evidence: ${orphaned.join(", ")}`,
    );
  }
}
```

- **R7:** `profile_version` rows are inserted, never updated (see the append-only grant in `data-model.md`'s _Privileges and immutability_); `db.insert` is the only write this file performs on that table.
- **R8:** `ProfileDocumentSchema.parse(document)` runs before any insert, both here and in F17's upload/edit paths — there is exactly one validated write function for the whole document, never a per-field `UPDATE`.
- **R9:** `assertNoOrphanedDatasetMapping` is exported for `profile-upload-edit.md`'s approval transaction to call inside the same transaction that would move `current_profile_version_id`, using the `jurisdiction_dataset.resource_type_key` values queried from `evidence` at that moment.

## Verification

- Unit tests: `checkProfileDocument` rejects each invalid shape named in R11 (duplicate key, dangling reference, overlapping in-force entries, missing settings entry); `resolveRulesInForce` against fixture documents for both a vesting and non-vesting rule set, including the missing-filing-date failure (R3); `ruleSetResolutionDate` with an injected clock, never `Date.now()`.
- Testcontainers integration tests: `createJurisdiction` requires staff; `getJurisdiction`/`getProfileVersion` enforce membership and jurisdiction scoping (R accounts R3/R6); `getCurrentProfile` returns `null` before any approval and the correct version after one is inserted directly for the test; `assertNoOrphanedDatasetMapping` against a fixture `jurisdiction_dataset` row.
- A golden fixture test resolves a hand-built profile document at three dates spanning a rule's `effectiveOn` and `repealedOn` and asserts the exact rule set returned at each, per the testing rules' determinism requirement.
