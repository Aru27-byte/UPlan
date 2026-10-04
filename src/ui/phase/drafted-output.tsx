import { Accordion } from "../accordion";
import { StatusLabel } from "../status-label";

import type { PhaseViewModel } from "./types";

// The drafted output of a phase (research-phases.md R1–R3, R13, R16): the headline, the sentences, and the
// fixed notice that says what wrote them. It renders exactly what it is given — a drafted summary is derived
// from measurements, so there is nothing here for a person to edit, and no control that suggests otherwise.
// The accordion is closed and its summary is the headline, so the answer reads without opening it. What
// changed since the last review stays outside it: that needs the planner's eye (R5, R10).
export function DraftedOutput({ model }: { model: PhaseViewModel }) {
  return (
    <>
      <Accordion
        group={model.group}
        title="Drafted output"
        summary={model.output ? model.output.headline : model.emptyReason}
        status={<StatusLabel tone={model.state.tone}>{model.state.text}</StatusLabel>}
      >
        <p className="mb-3 text-sm text-muted">
          UPlan&apos;s analysis engine drafts this from the phase&apos;s inputs. No language model wrote it.
        </p>
        {model.output ? (
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-text">
            {model.output.lines.map((line, i) => (
              <li key={`${i}:${line}`}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{model.emptyReason}</p>
        )}
      </Accordion>
      {model.changes ? (
        <div className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-sm">
          <p className="font-semibold text-warn">What changed since your review on {model.changes.since}</p>
          {model.changes.removed.length === 0 && model.changes.added.length === 0 ? (
            <p className="mt-2 text-text">
              The sentences are the same, but an input they are drafted from has a new revision, so this output needs a
              new review.
            </p>
          ) : null}
          {model.changes.removed.length > 0 ? (
            <div className="mt-2">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">No longer stated</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-text">
                {model.changes.removed.map((line, i) => (
                  <li key={`r${i}:${line}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {model.changes.added.length > 0 ? (
            <div className="mt-2">
              <p className="text-xs font-semibold tracking-wide text-muted uppercase">Now stated</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-text">
                {model.changes.added.map((line, i) => (
                  <li key={`a${i}:${line}`}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
