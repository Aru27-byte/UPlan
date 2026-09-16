import {
  ProfileDocumentSchema,
  getCurrentProfile,
  listProfileChanges,
  proposeUpload,
  type BufferRule,
  type ProfileDocument,
  type StudyTrigger,
} from "@/modules/profiles";
import { ValidationError } from "@/platform/errors";

import { requireActor } from "@/app/_lib/actor";
import { buttonClassName } from "@/ui/button-styles";
import { Card, type CardColor } from "@/ui/card";

const CARD_COLORS: CardColor[] = ["yellow", "blue", "green", "tan"];

function citationLine(
  citation: { codeSection: string; ordinance: string | null },
  effectiveOn: string,
): string {
  const ordinance = citation.ordinance ? `, Ordinance ${citation.ordinance}` : "";
  return `${citation.codeSection}${ordinance} · in force ${effectiveOn}`;
}

function rulesForResourceType(profile: ProfileDocument, resourceTypeKey: string) {
  const buffers: BufferRule[] = profile.bufferRules.filter((b) => b.resourceType === resourceTypeKey);
  const triggers: StudyTrigger[] = profile.studyTriggers.filter((t) => t.resourceType === resourceTypeKey);
  return { buffers, triggers };
}

// UIDesign/City_Profile.png — numbered rule cards from the current profile version, grouped by
// rule set (Critical Areas / Trees) since vesting is a per-rule-set setting (settings.vesting has
// exactly one entry per rule set, not per resource type — see the plan's "known gaps" note: the
// mockup's per-card vesting checkbox doesn't match what this schema actually models).
export default async function ProfilePage() {
  const { actor } = await requireActor();
  const firstMembership = actor.memberships[0];
  if (!firstMembership) {
    return <p className="text-ink/70">You have no jurisdiction membership yet.</p>;
  }
  const jurisdictionId = firstMembership.jurisdictionId;

  const [profileVersion, changes] = await Promise.all([
    getCurrentProfile(actor, jurisdictionId),
    listProfileChanges(actor, jurisdictionId),
  ]);

  async function uploadAction(formData: FormData) {
    "use server";
    const { actor: uploadingActor } = await requireActor();
    const file = formData.get("file");
    const reason = formData.get("reason");
    if (!(file instanceof File) || file.size === 0)
      throw new ValidationError("choose a workbook file to upload");
    if (typeof reason !== "string" || reason.trim().length === 0)
      throw new ValidationError("a reason is required");
    const buffer = Buffer.from(await file.arrayBuffer());
    await proposeUpload(uploadingActor, jurisdictionId, buffer, reason);
  }

  if (!profileVersion) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">Jurisdiction profile</h1>
        <p className="text-ink/70 mb-4">No profile has been approved for this jurisdiction yet.</p>
        <UploadForm action={uploadAction} />
      </div>
    );
  }

  const profile = ProfileDocumentSchema.parse(profileVersion.document);
  const criticalAreaTypes = profile.resourceTypes.filter((r) => r.ruleSet === "critical-areas");
  const criticalAreasVests =
    profile.settings.vesting.find((v) => v.ruleSet === "critical-areas")?.vests ?? false;
  const treesVests = profile.settings.vesting.find((v) => v.ruleSet === "trees")?.vests ?? false;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Jurisdiction profile</h1>
        <p className="text-ink/70 mt-1 text-sm">
          Every decision under this profile is analyzed under the rules and settings below.
        </p>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">Critical areas</h2>
          <span className="badge">{criticalAreasVests ? "Vesting" : "Not vesting"}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {criticalAreaTypes.map((resourceType, i) => {
            const { buffers, triggers } = rulesForResourceType(profile, resourceType.key);
            return (
              <Card key={resourceType.key} color={CARD_COLORS[i % CARD_COLORS.length]}>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold">
                    {String(i + 1).padStart(2, "0")} &middot; {resourceType.label}
                  </h3>
                  <span className="badge">{resourceType.mapStatus}</span>
                </div>
                {buffers.length === 0 && triggers.length === 0 ? (
                  <p className="mt-2 text-sm">No buffer or study-trigger rules recorded.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {buffers.map((b) => (
                      <li key={b.key}>
                        {b.widthFt} ft buffer — {citationLine(b.citation, b.effectiveOn)}
                      </li>
                    ))}
                    {triggers.map((t) => (
                      <li key={t.key}>
                        {t.study} within {t.withinFt} ft — {citationLine(t.citation, t.effectiveOn)}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="eyebrow">Significant trees</h2>
          <span className="badge">{treesVests ? "Vesting" : "Not vesting"}</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {profile.treeRules.map((rule, i) => (
            <Card key={rule.key} color={CARD_COLORS[i % CARD_COLORS.length]}>
              <h3 className="font-bold">
                {rule.kind === "significant-tree"
                  ? `${rule.group} ≥ ${rule.minDbhIn}" DBH`
                  : `Up to ${rule.maxCount} removed per ${rule.periodYears} years`}
              </h3>
              <p className="mt-2 text-sm">{citationLine(rule.citation, rule.effectiveOn)}</p>
            </Card>
          ))}
          {profile.treeRules.length === 0 ? (
            <p className="text-ink/70 text-sm">No tree rules recorded.</p>
          ) : null}
        </div>
      </section>

      <section>
        <h2 className="eyebrow mb-3">Change history</h2>
        {changes.length === 0 ? (
          <p className="text-ink/70 text-sm">No changes have been proposed yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {changes.map((change) => (
              <li key={change.id} className="card-sticker bg-white p-4 text-sm">
                <p className="font-medium">{change.reason}</p>
                <p className="text-ink/60 mt-1 text-xs">
                  {change.source} · proposed {change.proposedAt.toISOString().slice(0, 10)} · {change.status}
                  {change.decidedAt ? ` · decided ${change.decidedAt.toISOString().slice(0, 10)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="eyebrow mb-3">Upload rules from Excel</h2>
        <UploadForm action={uploadAction} />
      </section>
    </div>
  );
}

function UploadForm({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action} className="card-sticker flex flex-col gap-3 bg-white p-6 sm:max-w-md">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Workbook (.xlsx)
        <input
          type="file"
          name="file"
          accept=".xlsx"
          required
          className="border-ink/30 rounded-md border px-3 py-2"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Reason for this change
        <textarea name="reason" required className="border-ink/30 rounded-md border px-3 py-2" rows={3} />
      </label>
      <button type="submit" className={buttonClassName("primary", "text-ink")}>
        Propose change
      </button>
    </form>
  );
}
