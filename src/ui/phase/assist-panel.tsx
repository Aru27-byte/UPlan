import { Accordion } from "../accordion";
import { ActionForm } from "../action-form.client";
import { inputClassName } from "../action-styles";
import { StatusLabel } from "../status-label";
import { SubmitButton } from "../submit-button.client";

import type { AssistCardModel, AssistControlModel, AssistPanelModel } from "./assist-types";

// The AI assist panel (TechDesign/ai-assist.md, F24 R3, R9, R10, R11, R15). It sits beside a phase's drafted
// output and is never part of it. It renders exactly what it is given: every suggestion carries its label,
// its model and date, its quotes, and the fixed sentence that it is not part of the analysis, and a failure or
// rejection is shown as one, in words and a shape. Nothing here runs unasked: each control is a button.

const NOT_ANALYSIS =
  "AI-assisted text reads and quotes the sources shown. It is not part of the analysis, the phase's output or fingerprint, your review, or the final document.";

const STATUS_TONE = { ready: "info", rejected: "warn", failed: "danger", running: "neutral" } as const;

function Control({ control }: { control: AssistControlModel }) {
  const subjectId = `assist-${control.id}-subject`;
  return (
    <li className="rounded-lg border border-line bg-canvas/40 p-3">
      <ActionForm action={control.action} className="flex flex-col gap-2.5">
        <div>
          <p className="text-sm font-semibold text-text">{control.label}</p>
          <p className="text-xs text-muted">{control.hint}</p>
        </div>
        {control.disabledReason ? (
          <p className="text-sm text-muted">{control.disabledReason}</p>
        ) : (
          <>
            {control.subjects ? (
              <div>
                <label htmlFor={subjectId} className="mb-1 block text-xs font-semibold text-muted">
                  {control.subjectLabel}
                </label>
                <select id={subjectId} name="subjectKey" required className={inputClassName}>
                  {control.subjects.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {control.extra?.kind === "question" ? (
              <div>
                <label htmlFor={`assist-${control.id}-question`} className="mb-1 block text-xs font-semibold text-muted">
                  Your question
                </label>
                <input id={`assist-${control.id}-question`} name="question" required maxLength={300} className={inputClassName} placeholder="What does the code say about…" />
              </div>
            ) : null}
            {control.extra?.kind === "select" ? (
              <div>
                <label htmlFor={`assist-${control.id}-doc`} className="mb-1 block text-xs font-semibold text-muted">
                  {control.extra.label}
                </label>
                <select id={`assist-${control.id}-doc`} name={control.extra.name} required className={inputClassName}>
                  {control.extra.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {control.extra?.kind === "metadata" ? (
              <>
                <div>
                  <label htmlFor={`assist-${control.id}-dataset`} className="mb-1 block text-xs font-semibold text-muted">
                    Dataset
                  </label>
                  <select id={`assist-${control.id}-dataset`} name="datasetId" required className={inputClassName}>
                    {control.extra.options.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`assist-${control.id}-text`} className="mb-1 block text-xs font-semibold text-muted">
                    The publisher&apos;s metadata (abstract, lineage, use limitations)
                  </label>
                  <textarea id={`assist-${control.id}-text`} name="suppliedText" required rows={6} maxLength={12000} className={inputClassName} />
                </div>
              </>
            ) : null}
            <div>
              <SubmitButton variant="secondary" pendingLabel="Asking… this can take up to a minute">
                Ask
              </SubmitButton>
            </div>
          </>
        )}
      </ActionForm>
    </li>
  );
}

function Card({ card }: { card: AssistCardModel }) {
  return (
    <article aria-labelledby={`assist-card-${card.id}`} className="rounded-lg border border-line bg-surface p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 id={`assist-card-${card.id}`} className="text-sm font-semibold text-text">
            {card.title}
          </h3>
          {card.subject ? <p className="text-xs text-muted">{card.subject}</p> : null}
        </div>
        <StatusLabel tone={STATUS_TONE[card.status]}>{card.statusText}</StatusLabel>
      </header>
      <p className="mt-2 text-xs text-muted">{card.stamp}</p>

      {card.outOfDate ? (
        <p className="mt-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-sm text-text">
          <span className="font-semibold text-warn">Out of date. </span>
          {card.outOfDate} Ask again to get a suggestion for what is on the page now.
        </p>
      ) : null}

      {card.problemLines.length > 0 ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-text">
          {card.problemLines.map((line, i) => (
            <li key={`${i}:${line}`}>{line}</li>
          ))}
        </ul>
      ) : null}

      {card.blocks.length > 0 ? (
        <ol className="mt-3 flex flex-col gap-3">
          {card.blocks.map((block, i) => (
            <li key={`${i}:${block.text}`} className="text-sm text-text">
              {block.heading ? <p className="font-semibold">{block.heading}</p> : null}
              {block.text ? <p>{block.text}</p> : null}
              {block.note ? <p className="text-xs text-muted">{block.note}</p> : null}
              {block.quotes.map((q, j) => (
                <blockquote key={`${j}:${q.text}`} className="mt-1.5 border-l-4 border-line pl-3 text-sm text-text">
                  <p>&ldquo;{q.text}&rdquo;</p>
                  <footer className="text-xs text-muted">From: {q.source}</footer>
                </blockquote>
              ))}
            </li>
          ))}
        </ol>
      ) : null}

      {card.sent ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-medium text-brand">What was sent to the model service</summary>
          <pre className="mt-2 max-h-72 overflow-auto rounded-lg bg-canvas p-3 text-xs whitespace-pre-wrap text-text">{card.sent}</pre>
        </details>
      ) : null}

      {card.responses.length > 0 ? (
        <ul className="mt-3 space-y-0.5 text-xs text-muted">
          {card.responses.map((r, i) => (
            <li key={`${i}:${r}`}>{r}</li>
          ))}
        </ul>
      ) : null}

      {card.respondAction && card.status !== "running" ? (
        <ActionForm action={card.respondAction} className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          <input type="hidden" name="suggestionId" value={card.id} />
          <label htmlFor={`assist-note-${card.id}`} className="text-xs font-semibold text-muted">
            Note (optional)
          </label>
          <input id={`assist-note-${card.id}`} name="note" maxLength={2000} className={inputClassName} />
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="ghost" name="response" value="helpful">
              Helpful
            </SubmitButton>
            <SubmitButton variant="ghost" name="response" value="not-helpful">
              Not helpful
            </SubmitButton>
            <SubmitButton variant="ghost" name="response" value="dismissed">
              Dismiss
            </SubmitButton>
          </div>
        </ActionForm>
      ) : null}

      {card.confirm ? (
        <ActionForm action={card.confirm.action} className="mt-3 flex flex-col gap-3 rounded-xl border border-accent-gold/40 bg-canvas p-3">
          <input type="hidden" name="suggestionId" value={card.id} />
          <div>
            <p className="text-sm font-semibold text-text">{card.confirm.label}</p>
            <p className="text-xs text-muted">{card.confirm.description}</p>
          </div>
          {card.confirm.fields.map((field) =>
            field.kind === "checkboxes" ? (
              <fieldset key={field.name} className="flex flex-col gap-1.5">
                <legend className="text-xs font-semibold text-muted">{field.legend}</legend>
                {field.options.map((o) => (
                  <label key={o.value} className="flex items-start gap-2 text-sm text-text">
                    <input type="checkbox" name={field.name} value={o.value} defaultChecked className="mt-1" />
                    <span>{o.label}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <div key={field.name}>
                <label htmlFor={`assist-${card.id}-${field.name}`} className="mb-1 block text-xs font-semibold text-muted">
                  {field.label}
                </label>
                <input
                  id={`assist-${card.id}-${field.name}`}
                  name={field.name}
                  type={field.kind === "date" ? "date" : "text"}
                  required
                  placeholder={field.kind === "text" ? field.placeholder : undefined}
                  className={inputClassName}
                />
              </div>
            ),
          )}
          <div>
            <SubmitButton pendingLabel="Confirming…">Confirm and apply</SubmitButton>
          </div>
        </ActionForm>
      ) : null}
    </article>
  );
}

export function AssistPanel({ model, id }: { model: AssistPanelModel; id?: string }) {
  return (
    <Accordion id={id} group={model.group} title={model.title} summary={model.summary}>
      <p className="mb-4 rounded-lg border border-info/25 bg-info-soft px-4 py-3 text-sm text-text">{NOT_ANALYSIS}</p>
      {model.configured ? (
        model.controls.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {model.controls.map((control) => (
              <Control key={control.id} control={control} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">There is nothing to ask about on this page yet.</p>
        )
      ) : (
        <p role="status" className="text-sm text-muted">
          {model.notConfigured} This phase works fully without it.
        </p>
      )}
      {model.cards.length > 0 ? (
        <div className="mt-5 flex flex-col gap-3" aria-live="polite">
          <h3 className="text-sm font-semibold text-text">Suggestions</h3>
          {model.cards.map((card) => (
            <Card key={card.id} card={card} />
          ))}
        </div>
      ) : null}
    </Accordion>
  );
}
