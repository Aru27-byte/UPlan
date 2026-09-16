import Link from "next/link";
import type { ReactNode } from "react";
import { z } from "zod";

// UIDesign/Dashboard.png, Project_View_*.png — a decision's "● In progress"/"● Report released"
// pill: a colored dot + colored pill, distinct from Badge's ink confidence pills.
export const DecisionStatusSchema = z.enum(["in_progress", "report_released"]);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

const STATUS_LABEL: Record<DecisionStatus, string> = {
  in_progress: "In progress",
  report_released: "Report released",
};

export function StatusPill({ status }: { status: DecisionStatus }) {
  return (
    <span className="bg-card-green inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium text-ink">
      <span aria-hidden className="bg-accent-green-deep h-2 w-2 rounded-full" />
      {STATUS_LABEL[status]}
    </span>
  );
}

// UIDesign/Project_View_*.png — the "‹ Current Research / Title / meta line / status pill" header
// shared by every decision-detail tab.
export function PageHeader({
  backHref,
  backLabel,
  title,
  meta,
  status,
  actions,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  meta: ReactNode;
  status?: DecisionStatus;
  actions?: ReactNode;
}) {
  return (
    <div className="border-ink/20 border-b pb-4">
      <Link href={backHref} className="text-ink/70 text-sm hover:underline">
        &lsaquo; {backLabel}
      </Link>
      <div className="mt-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-ink/70 mt-1 text-sm">{meta}</p>
        </div>
        <div className="flex items-center gap-3">
          {actions}
          {status ? <StatusPill status={status} /> : null}
        </div>
      </div>
    </div>
  );
}

export function TabNav({ items }: { items: { href: string; label: string; active: boolean }[] }) {
  return (
    <nav className="border-ink/20 flex gap-6 border-b">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`-mb-px border-b-2 py-3 text-sm font-medium ${
            item.active ? "border-ink text-ink" : "text-ink/60 hover:text-ink border-transparent"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
