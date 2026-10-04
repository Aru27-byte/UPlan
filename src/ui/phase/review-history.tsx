import { Accordion } from "../accordion";
import { StatusLabel } from "../status-label";

import type { PhaseViewModel } from "./types";

// The history of a phase (research-phases.md R8, R16): every review ever recorded for it, newest first, with
// who made it, when, the verdict, the note, and the summary it was made on — kept as it was shown, so it stays
// readable after a template's wording changes. Reviews are never edited or deleted.
export function ReviewHistory({ model }: { model: PhaseViewModel }) {
  const count = model.history.length;
  return (
    <Accordion
      group={model.group}
      title="History"
      summary={
        count === 0
          ? "No review has been recorded for this phase yet."
          : `${count} ${count === 1 ? "review" : "reviews"}, newest first. Reviews are never edited or deleted.`
      }
    >
      {count === 0 ? (
        <p className="text-sm text-muted">No review has been recorded for this phase yet.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line">
          {model.history.map((entry) => (
            <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusLabel tone={entry.tone}>{entry.verdictText}</StatusLabel>
                <span className="text-sm text-muted">
                  {entry.by} · {entry.at}
                </span>
              </div>
              {entry.note ? <p className="mt-1.5 text-sm text-text">“{entry.note}”</p> : null}
              <details className="mt-1.5 text-sm">
                <summary className="cursor-pointer rounded font-medium text-brand">The summary that was reviewed</summary>
                <p className="mt-2 font-semibold text-text">{entry.headline}</p>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-text">
                  {entry.lines.map((line, i) => (
                    <li key={`${i}:${line}`}>{line}</li>
                  ))}
                </ul>
              </details>
            </li>
          ))}
        </ol>
      )}
    </Accordion>
  );
}
