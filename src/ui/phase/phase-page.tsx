import type { ReactNode } from "react";

import { InputsBlock } from "./inputs-block";
import type { PhaseViewModel } from "./types";

// A phase page (research-phases.md R1, R15, R16): the report section this step feeds and its chat (`intro`), then
// what the section is drafted from, then the page's own detail. Everything below the intro that is data is a
// closed accordion; the chat and the section are controls, not data, and stay open. `editor` is the phase's own
// input control (the map, an upload), an exception that stays open and sits after the inputs it changes;
// `children` is the page's detail (the cards, the register, the tables), in accordions after the inputs.
export function PhasePage({
  model,
  intro,
  editor,
  children,
}: {
  model: PhaseViewModel;
  intro: ReactNode;
  editor?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      {intro}
      <InputsBlock model={model} />
      {editor}
      {children}
    </div>
  );
}
