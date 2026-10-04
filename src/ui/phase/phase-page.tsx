import type { ReactNode } from "react";

import type { ActionState } from "../action-state";

import { DraftedOutput } from "./drafted-output";
import { InputsBlock } from "./inputs-block";
import { ReviewHistory } from "./review-history";
import { ReviewPanel } from "./review-panel.client";
import type { PhaseViewModel } from "./types";

// A phase page (research-phases.md R1, R15, R16): the report section this step feeds with its feedback box
// (`intro`), then what the output is drafted from, the output, the review, and the history. Everything below
// the intro that is data is a closed accordion; the review form is a control and stays open. `editor` is the
// phase's own input control (the map, an upload), an exception that stays open and sits right after the
// inputs it changes; `children` is the page's detail (the cards, the register, the tables) and sits between
// the drafted output and the review, so a planner reads the evidence before deciding.
export function PhasePage({
  model,
  reviewAction,
  intro,
  editor,
  children,
}: {
  model: PhaseViewModel;
  reviewAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  intro: ReactNode;
  editor?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      {intro}
      {editor}
      <InputsBlock model={model} />
      <DraftedOutput model={model} />
      {children}
      <ReviewPanel model={model} action={reviewAction} />
      <ReviewHistory model={model} />
    </div>
  );
}
