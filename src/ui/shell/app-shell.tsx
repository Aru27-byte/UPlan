import type { ReactNode } from "react";

import { Backdrop } from "../auth-shell";

import { AppNav, type NavItem } from "./app-nav.client";

// The signed-in app's frame: the navigation rail and the content column. A Server Component: userName,
// userEmail, and cityName are already-resolved plain strings from the caller (src/app/(app)/layout.tsx),
// never fetched here — this file holds no data access of its own. The city profile is in the navigation on
// every page, with the city's name beneath it, so it reads as a place and not a setting (F20 R6).
export function AppShell({
  userName,
  userEmail,
  cityName,
  children,
}: {
  userName: string;
  userEmail: string;
  cityName: string;
  children: ReactNode;
}) {
  const items: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard", matchPrefixes: ["/dashboard", "/projects"] },
    { href: "/profile", label: "City profile", detail: cityName, icon: "city", matchPrefixes: ["/profile"] },
    { href: "/help", label: "Help", icon: "help", matchPrefixes: ["/help"] },
  ];
  return (
    <div data-app className="relative isolate min-h-screen overflow-x-clip">
      <Backdrop className="fixed" />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border-2 focus:border-ink focus:bg-accent-gold focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-ink focus:shadow-button"
      >
        Skip to content
      </a>
      <AppNav items={items} userName={userName} userEmail={userEmail}>
        {children}
      </AppNav>
    </div>
  );
}
