"use client";

import type { ReactNode } from "react";

import { Icon } from "../icons";
import { panelClassName } from "../panel";
import { StatusLabel } from "../status-label";

import { GROUP_TONE } from "./group-tones";
import { SectionChat } from "./section-chat.client";
import { SectionChanges, SectionHistory } from "./section-history";
import type { ReportSectionModel, SectionChatModel } from "./types";

// The top of every step page except Report (research-phases.md R1, R6, R15, R16): the section of the final
// document this step produces, shown as it will read in the document (`children`, rendered by the server from
// the same section components the document is stitched from), beside the section chat. The two halves sit side
// by side when the block itself is 48rem wide or more and stack below that: a container query, because the
// sidebar makes the viewport width a poor guide to the room the block has. Plain props only: src/ui imports no
// runtime code from @/modules.
export function ReportSectionPanel({
  model,
  chat,
  children,
  projectId,
}: {
  model: ReportSectionModel;
  chat: SectionChatModel | null;
  children: ReactNode;
  projectId: string;
}) {
  const tone = GROUP_TONE[model.group];
  const disabledReason = model.editable
    ? null
    : model.readOnly
      ? model.readOnlyReason
      : (model.emptyReason ?? "This section has no output yet, so there is nothing to ask about.");

  return (
    <section aria-label={`Report section from ${model.stepTitle}`} className={`@container overflow-hidden ${panelClassName}`}>
      <div className="grid @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className={`flex min-w-0 flex-col gap-3 border-b border-line px-5 py-4 text-text @3xl:border-r @3xl:border-b-0 ${tone.fill}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`eyebrow flex items-center gap-1.5 font-bold ${tone.text}`}>
              <Icon name="document" />
              Report section · from {model.stepTitle}
            </p>
            {model.state ? <StatusLabel tone={model.state.tone}>{model.state.text}</StatusLabel> : null}
          </div>

          {children}

          {model.staleVersion ? (
            <p className="rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-text">
              <span className="font-semibold text-warn">Out of date. </span>
              {model.state?.kind === "out-of-date"
                ? "The analysis has moved on. This is the newest stored version; update it to the current analysis in the history."
                : (model.emptyReason ?? "This stored version was built before the analysis changed.")}
            </p>
          ) : null}

          <p className="text-xs text-muted">
            Maps, tables, figures, and quoted text are locked. The narrative can change through UPlan Assist.
          </p>

          {model.changes ? (
            <div className="rounded-lg border border-line bg-canvas/50 px-3 py-2 text-sm">
              <p className="font-semibold text-text">What changed</p>
              <SectionChanges changes={model.changes} />
            </div>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-3 px-5 py-4">
          {chat ? (
            <SectionChat model={chat} disabledReason={disabledReason} projectId={projectId} />
          ) : (
            <p className="text-sm text-muted">
              The Overview is read-only. It shows the project&apos;s recorded details and is not part of the report.
            </p>
          )}
        </div>
      </div>

      <SectionHistory model={model} />
    </section>
  );
}
