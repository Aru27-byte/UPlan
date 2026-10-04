import type { ReactNode } from "react";

import type { ProfileDocument } from "@/modules/profiles";
import { ActionForm } from "@/ui/action-form.client";
import { inputClassName } from "@/ui/action-styles";
import { SubmitButton } from "@/ui/submit-button.client";

import { saveSettingsAction } from "./actions";

type RecordType = ProfileDocument["settings"]["retention"][number]["recordType"];

const RULE_SET_LABEL = { "critical-areas": "Critical area rules", trees: "Tree rules" } as const;
const RECORD_LABEL = {
  decision: "Decisions",
  report: "Reports",
  "profile-change": "Profile changes",
  "records-export": "Records exports",
} as const satisfies Record<RecordType, string>;
const EXPORT_FORMATS = [
  { value: "pdf", label: "PDF" },
  { value: "csv", label: "CSV" },
  { value: "geojson", label: "GeoJSON" },
  { value: "xlsx", label: "Excel" },
] as const;

// Each section's title sits on its own colored badge. Ink on each of these fills is one of the app's checked pairs.
type BadgeTone = "gold" | "blue" | "green" | "yellow";
const BADGE_BASE = "mx-1 rounded-md border-2 border-ink px-2.5 py-0.5 text-sm font-bold text-ink shadow-[2px_2px_0_0_var(--color-ink)]";
const BADGE_TONE: Record<BadgeTone, string> = {
  gold: "bg-accent-gold",
  blue: "bg-card-blue",
  green: "bg-card-green",
  yellow: "bg-card-yellow",
};

// The settings planners choose, in place of confirming them with the city for each project (charter, "Settings
// planners choose"). One form saves all of them as a new profile version; it carries the revision it was built
// from, so a save from an out-of-date panel is refused rather than overwriting a newer change.
export function SettingsForm({ jurisdictionId, versionId, profile }: { jurisdictionId: string; versionId: string; profile: ProfileDocument }) {
  const { settings, resourceTypes } = profile;
  return (
    <ActionForm action={saveSettingsAction.bind(null, jurisdictionId)} className="flex flex-col gap-5">
      <input type="hidden" name="baseVersionId" value={versionId} />

      <Group title="Vesting" tone="gold" description="Which rule sets are judged under the rules in force when an application was filed.">
        {settings.vesting.map((v) => (
          <Row key={v.ruleSet} label={RULE_SET_LABEL[v.ruleSet]} htmlFor={`vesting-${v.ruleSet}`}>
            <select id={`vesting-${v.ruleSet}`} name={`vesting:${v.ruleSet}`} defaultValue={v.vests ? "vest" : "current"} className={inputClassName}>
              <option value="vest">Vest to the filing date</option>
              <option value="current">Use today&apos;s rules</option>
            </select>
          </Row>
        ))}
      </Group>

      <Group title="Map status" tone="blue" description="Whether each mapped boundary is the regulated line, or only approximate until a site study sets it.">
        {resourceTypes.map((r) => (
          <Row key={r.key} label={r.label} htmlFor={`map-status-${r.key}`}>
            <select id={`map-status-${r.key}`} name={`mapStatus:${r.key}`} defaultValue={r.mapStatus} className={inputClassName}>
              <option value="regulatory">Regulatory boundary</option>
              <option value="approximate">Approximate boundary</option>
            </select>
          </Row>
        ))}
      </Group>

      <Group title="Records" tone="green" description="How long each kind of record is kept, and where the count starts.">
        {settings.retention.map((r) => (
          <Row key={r.recordType} label={RECORD_LABEL[r.recordType]} htmlFor={`retain-${r.recordType}`}>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id={`retain-${r.recordType}`}
                type="number"
                name={`retainYears:${r.recordType}`}
                defaultValue={r.retainYears}
                min={1}
                step={1}
                required
                aria-label={`${RECORD_LABEL[r.recordType]}: years kept`}
                className={`${inputClassName} !w-20 shrink-0`}
              />
              <span className="text-sm text-muted">years from</span>
              <select
                name={`countFrom:${r.recordType}`}
                defaultValue={r.countFrom}
                aria-label={`${RECORD_LABEL[r.recordType]}: count from`}
                className={`${inputClassName} min-w-0 flex-1 basis-36`}
              >
                <option value="created">Creation</option>
                <option value="report-released">Report release</option>
              </select>
            </div>
          </Row>
        ))}
      </Group>

      <fieldset className="rounded-lg border-2 border-line bg-surface p-4">
        <legend className={`${BADGE_BASE} ${BADGE_TONE.yellow}`}>Export formats</legend>
        <p className="mb-3 text-xs text-muted">The formats a records export can be downloaded in. Keep at least one.</p>
        <div className="grid grid-cols-2 gap-2">
          {EXPORT_FORMATS.map((f) => (
            <label key={f.value} className="flex items-center gap-2 rounded-lg border-2 border-line px-3 py-2 text-sm font-medium has-[:checked]:border-brand has-[:checked]:bg-brand-soft">
              <input
                type="checkbox"
                name="exportFormats"
                value={f.value}
                defaultChecked={settings.exportFormats.includes(f.value)}
                className="size-4 accent-brand"
              />
              {f.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center justify-between gap-3 border-t-2 border-line bg-canvas px-5 py-3">
        <p className="text-xs text-muted">Saving applies the settings at once and re-analyzes open projects.</p>
        <SubmitButton pendingLabel="Saving…">Save settings</SubmitButton>
      </div>
    </ActionForm>
  );
}

function Group({ title, tone, description, children }: { title: string; tone: BadgeTone; description: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border-2 border-line bg-surface p-4">
      <legend className={`${BADGE_BASE} ${BADGE_TONE[tone]}`}>{title}</legend>
      <p className="mb-3 mt-1 text-xs text-muted">{description}</p>
      <div className="flex flex-col gap-3">{children}</div>
    </fieldset>
  );
}

function Row({ label, htmlFor, children }: { label: string; htmlFor: string; children: ReactNode }) {
  return (
    <div className="grid items-center gap-1.5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-3">
      <label htmlFor={htmlFor} className="text-sm font-medium text-text">
        {label}
      </label>
      {children}
    </div>
  );
}
