import { z } from "zod";

// TechDesign/data-model.md ("The profile document") + TechDesign/jurisdiction-profile.md, which
// owns the full schema. One schema validates uploads and edits, generates the Excel template
// (template.ts), and types every reader — no path writes a document that skips this.

const Key = z.string().regex(/^[a-z][a-z0-9-]*$/, "must be lowercase-kebab-case");
export const RuleSetSchema = z.enum(["critical-areas", "trees"]);
export type RuleSet = z.infer<typeof RuleSetSchema>;

// The six critical area types the charter names, split where the round-4 mapping names two
// distinct resource types (habitat conservation areas, migration corridors), plus forest canopy —
// the one resourceType in ruleSet "trees". These are the values Sammamish's uploaded profile is
// expected to use; a second city's document may use others, since resourceTypes are configuration.
export const SAMMAMISH_RESOURCE_TYPE_KEYS = [
  "wetlands",
  "streams",
  "frequently-flooded-areas",
  "geologically-hazardous-areas",
  "habitat-conservation-areas",
  "migration-corridors",
  "critical-aquifer-recharge-areas",
  "forest-canopy",
] as const;

const CitationSchema = z.object({
  codeSection: z.string().min(1), // "SMC 21.03.020.C"
  ordinance: z.string().min(1).nullable(), // null when the code section is the only reference
  sourceUrl: z.url(),
});
export type Citation = z.infer<typeof CitationSchema>;

const InForceSchema = z.object({
  effectiveOn: z.iso.date(),
  repealedOn: z.iso.date().nullable(), // null while the rule is in force
});

const ResourceTypeSchema = z.object({
  key: Key,
  label: z.string().min(1),
  ruleSet: RuleSetSchema,
  mapStatus: z.enum(["regulatory", "approximate"]),
});
export type ResourceType = z.infer<typeof ResourceTypeSchema>;

const BufferRuleSchema = z
  .object({
    key: Key,
    resourceType: Key,
    appliesWhen: z.object({ attribute: z.string().min(1), equals: z.string().min(1) }).nullable(),
    widthFt: z.number().positive(),
    citation: CitationSchema,
  })
  .extend(InForceSchema.shape);
export type BufferRule = z.infer<typeof BufferRuleSchema>;

const StudyTriggerSchema = z
  .object({
    key: Key,
    resourceType: Key,
    study: z.enum(["critical-area-study", "geotechnical-report", "arborist-report"]),
    withinFt: z.number().nonnegative(),
    citation: CitationSchema,
  })
  .extend(InForceSchema.shape);
export type StudyTrigger = z.infer<typeof StudyTriggerSchema>;

const TreeRuleSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("significant-tree"),
      key: Key,
      group: z.enum(["conifer", "deciduous"]),
      minDbhIn: z.number().positive(),
      citation: CitationSchema,
    })
    .extend(InForceSchema.shape),
  z
    .object({
      kind: z.literal("removal-cap"),
      key: Key,
      maxCount: z.number().int().positive(),
      periodYears: z.number().int().positive(),
      citation: CitationSchema,
    })
    .extend(InForceSchema.shape),
]);
export type TreeRule = z.infer<typeof TreeRuleSchema>;

export const SettingsSchema = z.object({
  vesting: z.array(z.object({ ruleSet: RuleSetSchema, vests: z.boolean() })),
  retention: z.array(
    z.object({
      recordType: z.enum(["decision", "report", "profile-change", "records-export"]),
      retainYears: z.number().int().positive(),
      countFrom: z.enum(["created", "report-released"]),
    }),
  ),
  exportFormats: z.array(z.enum(["pdf", "csv", "geojson", "xlsx"])).min(1),
});

function checkProfileDocument(doc: ProfileDocumentInput, ctx: z.RefinementCtx): void {
  const resourceTypeKeys = new Set<string>();
  for (const rt of doc.resourceTypes) {
    if (resourceTypeKeys.has(rt.key)) {
      ctx.addIssue({
        code: "custom",
        message: `duplicate resource type key "${rt.key}"`,
        path: ["resourceTypes"],
      });
    }
    resourceTypeKeys.add(rt.key);
  }

  const checkDanglingReference = (items: { resourceType: string }[], path: string) => {
    for (const item of items) {
      if (!resourceTypeKeys.has(item.resourceType)) {
        ctx.addIssue({
          code: "custom",
          message: `references unknown resource type "${item.resourceType}"`,
          path: [path],
        });
      }
    }
  };
  checkDanglingReference(doc.bufferRules, "bufferRules");
  checkDanglingReference(doc.studyTriggers, "studyTriggers");

  const checkNoOverlap = (
    items: { key: string; effectiveOn: string; repealedOn: string | null }[],
    path: string,
  ) => {
    const byKey = new Map<string, typeof items>();
    for (const item of items) byKey.set(item.key, [...(byKey.get(item.key) ?? []), item]);
    for (const [key, entries] of byKey) {
      for (let i = 0; i < entries.length; i++) {
        const a = entries[i];
        if (!a) continue; // noUncheckedIndexedAccess — never actually undefined within the loop bound
        for (let j = i + 1; j < entries.length; j++) {
          const b = entries[j];
          if (!b) continue;
          const aEnd = a.repealedOn ?? "9999-12-31";
          const bEnd = b.repealedOn ?? "9999-12-31";
          const overlaps = a.effectiveOn < bEnd && b.effectiveOn < aEnd;
          if (overlaps) {
            ctx.addIssue({
              code: "custom",
              message: `two entries for rule key "${key}" are in force on the same day`,
              path: [path],
            });
          }
        }
      }
      for (const e of entries) {
        if (e.repealedOn !== null && e.repealedOn <= e.effectiveOn) {
          ctx.addIssue({
            code: "custom",
            message: `rule "${key}": repealedOn must be after effectiveOn`,
            path: [path],
          });
        }
      }
    }
  };
  checkNoOverlap(doc.bufferRules, "bufferRules");
  checkNoOverlap(doc.studyTriggers, "studyTriggers");
  checkNoOverlap(doc.treeRules, "treeRules");

  for (const ruleSet of RuleSetSchema.options) {
    if (!doc.settings.vesting.some((v) => v.ruleSet === ruleSet)) {
      ctx.addIssue({
        code: "custom",
        message: `settings.vesting is missing an entry for rule set "${ruleSet}"`,
        path: ["settings", "vesting"],
      });
    }
  }
  const recordTypes = ["decision", "report", "profile-change", "records-export"] as const;
  for (const recordType of recordTypes) {
    if (!doc.settings.retention.some((r) => r.recordType === recordType)) {
      ctx.addIssue({
        code: "custom",
        message: `settings.retention is missing an entry for record type "${recordType}"`,
        path: ["settings", "retention"],
      });
    }
  }
}

const ProfileDocumentShape = z.object({
  schemaVersion: z.literal(1),
  resourceTypes: z.array(ResourceTypeSchema).min(1),
  bufferRules: z.array(BufferRuleSchema),
  studyTriggers: z.array(StudyTriggerSchema),
  treeRules: z.array(TreeRuleSchema),
  settings: SettingsSchema,
});
type ProfileDocumentInput = z.infer<typeof ProfileDocumentShape>;

export const ProfileDocumentSchema = ProfileDocumentShape.superRefine(checkProfileDocument);
export type ProfileDocument = z.infer<typeof ProfileDocumentSchema>;

export const CURRENT_TEMPLATE_VERSION = 1;
