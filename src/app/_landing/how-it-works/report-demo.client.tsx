"use client";

import { useState } from "react";

import { Button } from "@/ui/button.client";
import { Icon } from "@/ui/icons";

// A small working model of the report step: the readiness checklist, then the one button that
// publishes the document. Pressing it shows the locked result a planner actually gets. Invented
// section names and hash.
const CHECKLIST = [
  { label: "Evidence base", note: "6 resource types · 2 sources · 1 disagreement stated" },
  { label: "Screening", note: "Register of measurements, with gaps called out" },
  { label: "Studies", note: "4 studies named · 2 flagged by mapped data" },
  { label: "Impact", note: "5 measures · 1 range · no verdict" },
  { label: "Report narrative", note: "Drafted with UPlan Assist, reviewed by the planner" },
] as const;

export function ReportDemo() {
  const [generated, setGenerated] = useState(false);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <div className="rounded-xl border border-line bg-canvas p-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold tracking-[0.08em] text-muted uppercase">
            Before finishing
          </p>
          <span className="rounded-full border border-accent-green/45 bg-accent-green/[0.12] px-2 py-0.5 text-[10px] font-semibold text-accent-lime">
            5 of 5 ready
          </span>
        </div>

        <ul className="mt-2.5 flex flex-col divide-y divide-line/70">
          {CHECKLIST.map((item) => (
            <li key={item.label} className="flex items-start gap-2.5 py-2">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-green/15 text-accent-lime">
                <Icon name="check" className="size-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-text">{item.label}</p>
                <p className="text-[11px] leading-relaxed text-muted">{item.note}</p>
              </div>
              <span className="shrink-0 text-[10px] font-semibold text-accent-lime">Ready</span>
            </li>
          ))}
        </ul>
      </div>

      {generated ? (
        <div
          role="status"
          className="message-in rounded-xl border border-accent-green/45 bg-accent-green/[0.1] p-3.5"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-bold text-heading">Version 1 &middot; released</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold text-cream">
              <svg aria-hidden viewBox="0 0 16 16" className="size-3 fill-current">
                <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
              </svg>
              Locked
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-text">
            The document is generated from one pinned analysis run. It cannot be edited; a
            correction is a new version, and the original stays exactly as released.
          </p>
          <p className="mt-2 font-mono text-[10px] break-all text-muted">
            SHA-256 9f2c41d8&hellip;b07e71a3
          </p>
        </div>
      ) : (
        <p className="text-[11px] leading-relaxed text-muted">
          Finishing generates one PDF: the evidence, the impact, and what remains uncertain &mdash;
          stored, hashed, and never changed.
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <Button onPress={() => setGenerated(true)} isDisabled={generated} size="md">
          {generated ? "Report generated" : "Generate report"}
          {!generated ? (
            <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 8h9M9 4.5 12.5 8 9 11.5" />
            </svg>
          ) : null}
        </Button>
        <span className="text-[10px] text-faint">Tagged PDF · WCAG 2.1 AA</span>
      </div>
    </div>
  );
}
