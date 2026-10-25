"use client";

import { Icon } from "@/ui/icons";

// The constant column beside the four phases. The conversation is invented, like every other
// figure on the page: it shows what UPlan Assist does (cite the evidence, never make the call),
// not a live model. It does not move with the phase cards.
export function AssistChat() {
  return (
    <aside
      aria-label="UPlan Assist"
      className="flex h-full min-h-[420px] w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface/90 shadow-panel backdrop-blur"
    >
      <header className="border-b border-line bg-canvas/70 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-accent-green/15 text-accent-lime">
            <Icon name="sparkles" className="size-4" />
          </span>
          <div>
            <p className="text-sm font-bold text-heading">UPlan Assist</p>
            <p className="text-[11px] text-accent-lime">With you on every step</p>
          </div>
        </div>
      </header>

      <div
        role="group"
        tabIndex={0}
        aria-label="Sample conversation with UPlan Assist"
        className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-3.5 py-3 outline-3 outline-offset-2 outline-transparent focus-visible:outline-accent-gold"
      >
        <div className="ml-auto max-w-[86%] rounded-2xl rounded-br-md bg-accent-green px-3 py-2 text-[13px] text-ink">
          What should I look at first on this site?
        </div>

        <div className="max-w-[94%] rounded-2xl rounded-bl-md border border-line bg-canvas px-3 py-2.5 text-[13px] leading-relaxed text-text">
          Start with the wetland buffer. The mapped wetland is{" "}
          <span className="font-semibold">0.42 ac</span>, but the buffer is{" "}
          <span className="font-semibold">0.9&ndash;2.4 ac</span> because the rule depends on the
          wetland&rsquo;s rating &mdash; a field study sets it.
          <p className="mt-1.5 border-t border-line pt-1.5 text-[10px] text-muted">
            Source: Example State Agency, 2021-06-01 &middot; Retrieved 2026-09-12 &middot;
            Moderate confidence
          </p>
        </div>

        <div className="ml-auto max-w-[86%] rounded-2xl rounded-br-md bg-accent-green px-3 py-2 text-[13px] text-ink">
          What is still missing?
        </div>

        <div className="max-w-[94%] rounded-2xl rounded-bl-md border border-line bg-canvas px-3 py-2.5 text-[13px] leading-relaxed text-text">
          Aquifer recharge has no usable dataset here, so screening says{" "}
          <span className="font-semibold">&ldquo;not checked&rdquo;</span> &mdash; not &ldquo;none
          found.&rdquo;
        </div>

        <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {["Explain this figure", "Where is this in the code?", "Draft a summary"].map((chip) => (
            <span
              key={chip}
              className="rounded-full border border-accent-gold/35 bg-accent-gold/[0.08] px-2.5 py-1 text-[10px] font-semibold text-accent-gold"
            >
              {chip}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-line px-3.5 py-2.5">
        <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-page px-3 py-1.5 text-[13px] text-faint">
          <span className="flex-1">Ask about this step&hellip;</span>
          <span
            aria-hidden
            className="flex size-6 items-center justify-center rounded-md bg-accent-green text-ink"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 8h9M9 4.5 12.5 8 9 11.5" />
            </svg>
          </span>
        </div>
        <p className="mt-1.5 text-[10px] leading-relaxed text-faint">
          Answers cite the evidence on the page. UPlan Assist never makes the permit decision.
        </p>
      </div>
    </aside>
  );
}
