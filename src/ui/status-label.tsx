import type { ReactNode } from "react";

import { Icon, type IconName } from "./icons";

// A status, told by words AND a shape — never color alone (WCAG 1.4.1, project-dashboard.md R8). One of
// five tones; each has its own icon, so two different states are distinguishable in grayscale too.
export type StatusTone = "neutral" | "info" | "warn" | "danger" | "ok";

const TONE: Record<StatusTone, { icon: IconName; classes: string }> = {
  neutral: { icon: "circle", classes: "bg-canvas text-ink border-ink/50" },
  info: { icon: "dot", classes: "bg-info-soft text-info border-info/60" },
  warn: { icon: "alert", classes: "bg-warn-soft text-warn border-warn/60" },
  danger: { icon: "x", classes: "bg-danger-soft text-danger border-danger/60" },
  ok: { icon: "check", classes: "bg-ok-soft text-ok border-ok/60" },
};

export function StatusLabel({ tone = "neutral", children }: { tone?: StatusTone; children: ReactNode }) {
  const { icon, classes } = TONE[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${classes}`}>
      <Icon name={icon} />
      {children}
    </span>
  );
}
