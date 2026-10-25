"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import { actionClassName, inputClassName } from "@/ui/action-styles";
import { Icon } from "@/ui/icons";

import { askDashboardQuestionAction } from "@/app/(app)/projects/actions";

type DashboardAssistProps = {
  cityId: string;
  actorId: string;
  summaries: { decision: { id: string; title: string }; state: string; phasesReady: number; phasesTotal: number; nextAction?: { step: string; key: string } | null }[];
};

export function DashboardAssist({ cityId, actorId, summaries }: DashboardAssistProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inProgressCount = summaries.filter((s) => s.state !== "completed").length;
  const completedCount = summaries.filter((s) => s.state === "completed").length;
  const totalPhasesLeft = summaries.reduce((sum, s) => sum + (s.phasesTotal - s.phasesReady), 0);
  const projectsNeedingAttention = summaries.filter((s) => s.state === "in-progress" && s.phasesReady < s.phasesTotal).length;

  const suggestions = [
    "Which projects need attention right now?",
    "Summarize all my in-progress projects",
    "Which projects have the most phases left?",
    "What should I work on next?",
    "List all completed projects with their versions",
    "Are any projects stuck or need help?",
  ];

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("question", question);
    formData.append("cityId", cityId);
    formData.append("actorId", actorId);

    askDashboardQuestionAction({}, formData)
      .then((res) => {
        if (res.error) {
          setError(res.error);
        } else if (res.notice) {
          setAnswer(res.notice);
        }
      })
      .catch(() => {
        setError("Failed to get answer. Please try again.");
      })
      .finally(() => setIsLoading(false));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={actionClassName("secondary")}
        aria-haspopup="dialog"
        aria-label="Open UPlan Assist"
      >
        <Icon name="sparkles" />
        UPlan Assist
      </button>

      {/* The same right-hand flyout the city profile uses for Sources: a native <dialog> opens in the
          browser's top layer, so it fills the whole viewport height instead of being clipped by a page
          container, and Escape, focus trapping, and the backdrop are the browser's own. */}
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="flyout m-0 ml-auto h-dvh max-h-none w-[min(34rem,100vw)] max-w-none border-l border-line-strong bg-canvas p-0 text-text shadow-float backdrop:bg-black/40"
      >
        <div className="flex h-full flex-col">
          <header className="bg-nav px-5 py-4 text-nav-text">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-accent-gold">Dashboard</p>
                <h2 id={titleId} className="font-display text-2xl font-extrabold tracking-tight text-heading">
                  UPlan Assist
                </h2>
                <p className="mt-1 text-xs text-nav-muted">
                  Ask about your projects, get summaries, find what needs attention.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close UPlan Assist"
                onClick={() => dialogRef.current?.close()}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-nav-text transition-[background-color,color,border-color,transform] duration-200 hover:border-accent-gold hover:text-accent-gold motion-safe:hover:rotate-90"
              >
                <Icon name="close" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-line bg-surface p-3">
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">In Progress</p>
                <p className="mt-0.5 text-2xl font-bold text-text">{inProgressCount}</p>
              </div>
              <div className="rounded-lg border border-line bg-surface p-3">
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">Completed</p>
                <p className="mt-0.5 text-2xl font-bold text-text">{completedCount}</p>
              </div>
              <div className="rounded-lg border border-line bg-surface p-3">
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">Phases Left</p>
                <p className="mt-0.5 text-2xl font-bold text-text">{totalPhasesLeft}</p>
              </div>
              <div className="rounded-lg border border-line bg-surface p-3">
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">Need Attention</p>
                <p className="mt-0.5 text-2xl font-bold text-text">{projectsNeedingAttention}</p>
              </div>
            </div>

            <div className="rounded-lg border border-line bg-surface p-4">
              <h4 className="mb-3 text-sm font-semibold text-text">Quick questions</h4>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setQuestion(s)}
                    className="rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <label htmlFor="dashboard-question" className="flex flex-col gap-1.5 text-sm font-medium">
                Ask a question
                <textarea
                  id="dashboard-question"
                  name="question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  rows={3}
                  maxLength={500}
                  disabled={isLoading}
                  className={`${inputClassName} resize-none font-normal ${isLoading ? "opacity-50" : ""}`}
                  placeholder="e.g., Which project should I prioritize? What's blocking the Ridge Estates project?"
                />
              </label>
              {error && (
                <p className="text-sm text-danger" role="alert">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!question.trim() || isLoading}
                  className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                    !question.trim() || isLoading
                      ? "cursor-not-allowed border-line bg-canvas/50 text-muted"
                      : "border-brand bg-brand text-white hover:bg-brand/90"
                  }`}
                >
                  {isLoading ? "Thinking…" : "Ask"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQuestion("");
                    setAnswer(null);
                    setError(null);
                  }}
                  disabled={!answer && !error}
                  className="rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-muted hover:border-line-strong hover:text-text disabled:opacity-50"
                >
                  Clear
                </button>
              </div>
            </form>

            {answer && (
              <div className="animate-fade-in rounded-lg border border-ok/30 bg-ok-soft p-4">
                <div className="flex items-start gap-2">
                  <Icon name="sparkles" className="mt-0.5 text-ok" />
                  <div className="prose prose-sm flex-1 text-text">
                    {answer.split("\n").map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
