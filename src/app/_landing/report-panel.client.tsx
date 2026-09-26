"use client";

import { useState } from "react";
import { Button } from "react-aria-components";

// One landing-showcase panel: a released report as a locked document (locked-report.md R2, R3, R4,
// R6, R8, R9). The one interaction is the honest one — trying to edit it. The title, sections, and
// hash are invented for the page.
const SECTIONS = ["Evidence", "Impact", "Disagreements and gaps", "What desk analysis cannot see"];

export function ReportPanel() {
  const [hasTriedEdit, setHasTriedEdit] = useState(false);

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-sm border border-ink/40 bg-white p-5 font-serif shadow-[0_2px_10px_rgb(0_0_0/0.15)] sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow font-sans text-ink/75">Impact report</p>
            <h3 className="mt-1 text-2xl font-bold">Sample subdivision &middot; Sammamish, WA</h3>
          </div>
          <span className="badge gap-1.5 font-sans">
            <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 fill-current">
              <path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 15h8a1.5 1.5 0 0 0 1.5-1.5v-6A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1Zm2 5H6V4.5a2 2 0 1 1 4 0V6Z" />
            </svg>
            Released &middot; locked
          </span>
        </div>

        <ol className="mt-5 grid gap-2 font-sans text-sm sm:grid-cols-2">
          {SECTIONS.map((section, index) => (
            <li key={section} className="flex items-center gap-3 rounded-lg bg-cream-soft px-3.5 py-2.5">
              <span className="font-mono text-xs font-semibold text-ink/75">{String(index + 1).padStart(2, "0")}</span>
              {section}
            </li>
          ))}
        </ol>

        <dl className="mt-5 grid gap-x-6 gap-y-1.5 border-t border-ink/20 pt-4 font-sans text-xs sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold text-ink/75">SHA-256</dt>
          <dd className="font-mono break-all">9f2c41d8&hellip;b07e71a3 (recorded when released)</dd>
          <dt className="font-semibold text-ink/75">Built from</dt>
          <dd>One pinned analysis run &mdash; never a blend of two</dd>
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onPress={() => setHasTriedEdit(true)}
          className="card-sticker cursor-pointer bg-white px-5 py-2.5 font-semibold outline-2 outline-offset-2 outline-transparent data-[focus-visible]:outline-ink data-[pressed]:translate-x-0.5 data-[pressed]:translate-y-0.5 data-[pressed]:shadow-none"
        >
          Try to edit this report
        </Button>
        <span className="badge">Tagged PDF</span>
        <span className="badge">WCAG 2.1 AA</span>
      </div>

      <p role="status" className="min-h-10 text-sm font-medium">
        {hasTriedEdit
          ? "Released reports can’t be edited, by anyone. A correction is a new revision and a new report; the original stays exactly as it was, and its hash proves it."
          : null}
      </p>
    </div>
  );
}
