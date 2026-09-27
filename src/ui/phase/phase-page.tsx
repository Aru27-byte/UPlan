import type { ReactNode } from "react";

import type { ActionState } from "../action-state";

import { DraftedOutput } from "./drafted-output";
import { InputsBlock } from "./inputs-block";
import { ReviewHistory } from "./review-history";
import { ReviewPanel } from "./review-panel.client";
import type { PhaseViewModel } from "./types";

// A phase page (research-phases.md R1): what the output is drafted from, the output, the review, and the
// history, in that order. `editor` is the phase's own input control (the map, an upload) and sits right after
// the inputs it changes; `children` is the page's detail (the cards, the register, the tables) and sits
// between the drafted output and the review, so a planner reads the evidence before deciding.
export function PhasePage({
  model,
  reviewAction,
  editor,
  children,
}: {
  model: PhaseViewModel;
  reviewAction: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  editor?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <InputsBlock model={model} />
      {editor}
      <DraftedOutput model={model} />
      {children}
      <ReviewPanel model={model} action={reviewAction} />
      <ReviewHistory model={model} />
    </div>
  );
}
