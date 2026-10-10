import type { ActionState } from "../action-state";

import type { StepGroup } from "./group-tones";

// The plain shape the assist panel renders (TechDesign/ai-assist.md, F24 R3, R15). The route builds it from the
// assist module's views and formats every date and label there, because src/ui imports no runtime code from
// @/modules: the panel receives strings, booleans, and bound Server Functions and nothing else.

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** A piece of a suggestion's body. Every statement that cites a source carries the exact quote beside it (R4). */
export type AssistBlock = {
  heading: string | null;
  text: string;
  quotes: { source: string; text: string }[];
  note: string | null;
};

export type AssistCardModel = {
  id: string;
  title: string;
  subject: string | null;
  status: "ready" | "rejected" | "failed" | "running";
  statusText: string;
  /** R3: states that it is AI-assisted, the model, when, and that it is not part of the analysis. */
  stamp: string;
  /** R10: the reason this was made on an output that has since changed, or null when it is current. */
  outOfDate: string | null;
  blocks: AssistBlock[];
  /** A rejection's failed checks, or a failure's reason, in words. */
  problemLines: string[];
  /** R8: the request that was sent, as stored, so anyone can see what left UPlan. */
  sent: string | null;
  responses: string[];
  respondAction: Action | null;
  /** A staff member's confirmation control, for a draft that another staff member requested. */
  confirm: { label: string; description: string; fields: AssistConfirmField[]; action: Action } | null;
};

export type AssistConfirmField =
  | { kind: "checkboxes"; name: string; legend: string; options: { value: string; label: string }[] }
  | { kind: "date"; name: string; label: string }
  | { kind: "text"; name: string; label: string; placeholder: string };

export type AssistControlModel = {
  id: string;
  label: string;
  /** One sentence on what it does and what it never does. */
  hint: string;
  /** A choice of what to ask about, or null when the assist is about the whole phase. */
  subjects: { value: string; label: string }[] | null;
  subjectLabel: string;
  /** Rule drafts and Find take the person's own words or a chosen document. */
  extra: { kind: "question" } | { kind: "select"; name: string; label: string; options: { value: string; label: string }[] } | { kind: "metadata"; options: { value: string; label: string }[] } | null;
  action: Action;
  /** A reason the control cannot be used right now, shown in place of the button. */
  disabledReason: string | null;
};

export type AssistPanelModel = {
  title: string;
  summary: string;
  /** False when no key is set: the panel says so and offers no button (a true state, not a fallback). */
  configured: boolean;
  notConfigured: string;
  controls: AssistControlModel[];
  cards: AssistCardModel[];
  group: StepGroup;
};
