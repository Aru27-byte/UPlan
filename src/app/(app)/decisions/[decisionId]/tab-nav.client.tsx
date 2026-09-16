"use client";

import { usePathname } from "next/navigation";

import { TabNav } from "@/ui/page-header";

// UIDesign/Project_View_*.png — Map/Evidence/Footprint/Impact/Report tabs. Client-only for
// usePathname()'s active-tab highlighting; every other decision-detail page stays a plain Server
// Component (file-structure-and-imports.md: client components hold no @/modules/@/platform import).
export function DecisionTabNav({ decisionId }: { decisionId: string }) {
  const pathname = usePathname();
  const base = `/decisions/${decisionId}`;
  const tabs = [
    { href: `${base}/map`, label: "Map" },
    { href: `${base}/evidence`, label: "Evidence" },
    { href: `${base}/footprint`, label: "Footprint" },
    { href: `${base}/impact`, label: "Impact" },
    { href: `${base}/report`, label: "Report" },
  ];
  return <TabNav items={tabs.map((t) => ({ ...t, active: pathname === t.href }))} />;
}
