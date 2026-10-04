import Link from "next/link";

import { Accordion } from "../accordion";

import type { PhaseViewModel } from "./types";

// "Drafted from" (research-phases.md R1, R9): what this output was drafted from, and where each input is
// changed. Iterating on an output means changing one of these and reading the new draft. A closed accordion
// (R16), whose summary counts the inputs.
export function InputsBlock({ model }: { model: PhaseViewModel }) {
  return (
    <Accordion
      group={model.group}
      title="Drafted from"
      summary={
        model.inputs.length > 0
          ? `${model.inputs.length} ${model.inputs.length === 1 ? "input" : "inputs"}. Change one and UPlan drafts this phase again.`
          : "Nothing is recorded for this phase yet."
      }
    >
      <div className="grid gap-6 sm:grid-cols-2">
        {model.inputs.length > 0 ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            {model.inputs.map((input) => (
              <div key={`${input.label}:${input.value}`} className="contents">
                <dt className="font-medium text-muted">{input.label}</dt>
                <dd className="min-w-0 break-words text-text">{input.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted">Nothing is recorded for this phase yet.</p>
        )}
        <ul className="flex flex-col gap-1.5 text-sm">
          {model.changeLinks.map((link) => (
            <li key={link.href}>
              <Link href={link.href} className="font-medium text-brand underline-offset-2 hover:underline">
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Accordion>
  );
}
