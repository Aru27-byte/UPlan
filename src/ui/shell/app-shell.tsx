import type { ReactNode } from "react";

import { SidebarNav, type NavItem } from "./sidebar-nav.client";

const NAV_ITEMS: NavItem[] = [
  { href: "/decisions", label: "Current Research" },
  { href: "/profile", label: "Profile" },
  { href: "/help", label: "Help" },
];

// UIDesign/Dashboard.png — the dark sidebar (logo, nav, city chip, user chip) beside a cream
// content area. Server Component: userName/cityName are already-resolved plain strings from the
// caller (src/app/(app)/layout.tsx), never fetched here — this file holds no data access of its own.
export function AppShell({
  userName,
  cityName,
  children,
}: {
  userName: string;
  cityName: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <aside className="bg-sidebar text-sidebar-foreground flex w-64 shrink-0 flex-col justify-between p-6">
        <div>
          <div className="mb-8 flex items-center gap-2">
            <span aria-hidden className="text-2xl">
              🌰
            </span>
            <span className="font-serif text-xl font-bold">UPlan</span>
          </div>
          <SidebarNav items={NAV_ITEMS} />
        </div>
        <div className="flex flex-col gap-3">
          <div className="card-sticker bg-accent-green/90 px-4 py-2 text-center text-sm font-medium text-ink">
            {cityName}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="bg-accent-green flex h-8 w-8 items-center justify-center rounded-full font-semibold text-ink">
              {initials(userName)}
            </span>
            <span>{userName}</span>
          </div>
        </div>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .map((p) => p[0])
    .filter((c): c is string => Boolean(c))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
