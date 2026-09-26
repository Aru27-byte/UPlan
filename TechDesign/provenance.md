# TechDesign — Provenance

**Feature:** F4 · `provenance`
**Status:** Draft
**Requirements:** [Requirements/provenance.md](../Requirements/provenance.md) (R1–R9)
**Builds on:** [system-architecture.md](system-architecture.md) (module map), [data-model.md](data-model.md) (`dataset_version`, profile `Citation`)
**Release:** 1

## Module

`src/modules/provenance/` owns a type, not a table — nothing here is stored; every field it renders is read from `evidence`, `profiles`, or `analysis` rows. Files:

```
src/modules/provenance/
  index.ts        exports: types, formatEvidenceProvenance, formatRuleProvenance,
                  formatDerivedProvenance, CONFIDENCE_DESCRIPTIONS
  types.ts        EvidenceProvenanceSchema, RuleProvenanceSchema, DerivedProvenanceSchema
  format.ts       the one formatter (pure functions, no I/O)
  format.test.ts  unit tests, one per R1–R9
```

No other module or route formats a source, a date, or a confidence level for display (R6). A caller passes the fields it has (from an `evidence_feature`/`dataset_version` row, or a profile rule's `Citation` + `effectiveOn`) into the matching `format*` function and gets back a plain, JSON-serializable value ready to render or export.

## Where the formatter runs, and how the boundary rule holds

`format.ts` has no dependency on the database, the request, or React — it is pure data in, structured data out. It still lives under `src/modules/`, so `.claude/rules/do-not.md`'s ban on importing `@/modules` runtime code into `*.client.tsx` or `src/ui/` applies: **only Server Components and module code call it.** The map workspace's client-side popup (`*.client.tsx`, Terra Draw/MapLibre) never imports `@/modules/provenance` — the Server Component that renders the map page calls `formatEvidenceProvenance`/`formatDerivedProvenance` for every feature it hands to the client component, and passes the results down as plain-string props. The same functions run again, unchanged, when `reports` renders the report's React tree and when `records` builds a CSV/GeoJSON export row. One code path, three surfaces (R8).

## Types

```ts
// types.ts
import { z } from "zod";

export const ConfidenceLevelSchema = z.enum(["high", "moderate", "low"]);
export type ConfidenceLevel = z.infer<typeof ConfidenceLevelSchema>;

export const EvidenceProvenanceSchema = z
  .object({
    publisher: z.string().min(1),
    license: z.string().min(1),
    sourceUrl: z.url(),
    sourceAsOn: z.iso.date().nullable(), // dataset_version.source_as_of
    sourceAsOfNote: z.string().min(1).nullable(), // required when sourceAsOn is null (R2)
    retrievedAt: z.iso.datetime(), // dataset_version.retrieved_at, UTC
    confidence: ConfidenceLevelSchema,
    confidenceRationale: z.string().min(1),
  })
  .superRefine((v, ctx) => {
    if (v.sourceAsOn === null && v.sourceAsOfNote === null) {
      ctx.addIssue({ code: "custom", message: "sourceAsOfNote is required when sourceAsOn is null" });
    }
  });
export type EvidenceProvenance = z.infer<typeof EvidenceProvenanceSchema>;

export const RuleProvenanceSchema = z.object({
  codeSection: z.string().min(1),
  ordinance: z.string().min(1).nullable(), // null: the code section is the only reference
  sourceUrl: z.url(),
  effectiveOn: z.iso.date(), // the date rulesInForce actually resolved for
});
export type RuleProvenance = z.infer<typeof RuleProvenanceSchema>;

// A figure derived from evidence, rules, or both — an impact measurement (F9),
// a screening flag, or anything analysis.ts produces.
export const DerivedProvenanceSchema = z
  .object({
    rules: z.array(RuleProvenanceSchema),
    evidence: z.array(EvidenceProvenanceSchema),
  })
  .refine((v) => v.rules.length + v.evidence.length > 0, "a derived figure must cite at least one source");
export type DerivedProvenance = z.infer<typeof DerivedProvenanceSchema>;
```

`noUncheckedIndexedAccess` and the no-`any`/no-`as` rules apply as everywhere else; every value reaching these schemas comes from a `.parse()` at the module boundary that read it, per `conventions.md`.

## The formatter

```ts
// format.ts
export type FormattedProvenance = {
  sourceLine: string; // "King County iMap (public domain) — sourced 2024-03-12"
  // or "…— publisher gives no survey date: <sourceAsOfNote>"
  retrievedLine: string; // "Retrieved by UPlan on 2026-08-01" — always separate from sourceLine (R2)
  confidenceLine: string | null; // null only for a rules-only DerivedProvenance (R5)
  citations: string[]; // one line per rule: "SMC 21.03.020.C, Ordinance O2024-12 (in force 2024-05-01)"
};

export function formatEvidenceProvenance(p: EvidenceProvenance): FormattedProvenance;
export function formatRuleProvenance(p: RuleProvenance): FormattedProvenance;
export function formatDerivedProvenance(p: DerivedProvenance): FormattedProvenance;

export const CONFIDENCE_DESCRIPTIONS: Record<ConfidenceLevel, string> = {
  high: "High confidence — current, site-scale survey data.",
  moderate: "Moderate confidence — public data that is dated, coarse, or partly modeled.",
  low: "Low confidence — data that only broadly indicates this resource; a site-specific study sets the real boundary.",
};
```

- **R1/R2:** `formatEvidenceProvenance` reads `sourceAsOn`/`sourceAsOfNote` as an exclusive pair (the schema already enforces exactly one is present) and always renders `retrievedLine` from `retrievedAt`, never as a stand-in for a missing source date.
- **R3:** `formatRuleProvenance` renders `ordinance` only when present; when it is null the citation reads "SMC 21.03.020.C (code section only)".
- **R4:** `formatDerivedProvenance` never averages or drops a source — `citations` has exactly one entry per rule and `sourceLine`/`retrievedLine` are repeated per evidence input when more than one contributed, rendered as a list rather than collapsed. The impact table (F9) and report (F10) render this list, never a single blended line.
- **R5:** `formatDerivedProvenance` computes confidence by taking the lowest `confidence` among `p.evidence` (`low` < `moderate` < `high`) and names which dataset it came from in `confidenceLine`. When `p.evidence` is empty (a rules-only figure, such as a pure citation with no measured input), `confidenceLine` is `null`, and every caller that renders a `FormattedProvenance` must render the literal text "Not applicable — this figure comes from adopted rules, not measured data" when `confidenceLine` is `null`, never blank space. This is enforced by a lint-visible convention: the shared `<ProvenanceNote>` UI component (in `src/ui/`, receiving only the already-formatted strings as props — never the module types) throws in development if asked to render a `FormattedProvenance` with `confidenceLine: null` without its "not applicable" fallback path.
- **R6:** exhaustive Grep-backed lint check (see _Verification_) — no other file in the repository contains a date-formatting or confidence-labeling literal outside `format.ts` and its test.
- **R7:** `CONFIDENCE_DESCRIPTIONS` is the only place level → sentence mapping exists; F9 and F10 quote it verbatim rather than writing their own summary.
- **R8:** the report's React tree (`reports` module, rendered by Playwright per `locked-report.md`) imports `formatDerivedProvenance`/`formatEvidenceProvenance` from `@/modules/provenance` exactly as the web app's Server Components do — no second formatter, no print-only string templates.
- **R9:** every module that assembles something for display (`evidence`, `analysis`, `reports`) types its output so a figure without a `Provenance`/`RuleProvenance` value cannot type-check; `switch`-free, this is enforced by the type shapes above having no optional provenance field.

### Additions (2026-09-27)

- **Sample data (`evidence-layers.md` R13).** `EvidenceProvenance` gains `isSample: boolean`. When it is true, `formatEvidenceProvenance` prefixes `sourceLine` with `Sample data (illustrative) — `. Because every screen, the map popup, the document, and the exports already read `sourceLine` from this one function, none of them decides this separately (R6).
- **Number display (`research-phases.md` R2).** The drafted phase summaries state areas, lengths, and counts, and conventions.md says values are rounded only in this module's display formatter. `format.ts` therefore gains `formatAcres`, `formatSqFt`, `formatFeet`, and `formatCount(n, singular, plural)`, each taking the stored, unrounded number and returning display text with thousands separators and a fixed precision (acres to one decimal, square feet and feet to whole numbers). `workflow`'s templates call these and never round themselves, and the repository-wide grep test extends to `.toFixed(` outside this module.
- **Evidence attributes (`evidence-review.md` R1).** `formatEvidenceAttributes` is specified there.

## Verification

- Unit tests in `format.test.ts`, one named per requirement (`it("R2: never substitutes retrievedAt for a missing sourceAsOn", …)`), covering: missing source date with note, ordinance-less citation, multi-evidence confidence-floor selection, rules-only derived provenance, and the exact confidence sentence text.
- A repository-wide grep in CI (a small Vitest test, not a new tool) asserts that no file outside `src/modules/provenance/` matches a date-formatting pattern applied to `sourceAsOn`/`retrievedAt`/`effectiveOn`, keeping R6 true as the codebase grows.
- No database access, so no Testcontainers test is needed for this module; every consumer module's integration tests assert that what they pass into `provenance` round-trips through the schemas above without a validation error.
