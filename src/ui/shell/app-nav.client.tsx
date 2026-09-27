"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { actionClassName } from "../action-styles";
import { Icon, type IconName } from "../icons";

// The signed-in app's navigation rail (project-dashboard.md, "The shell"). On a desktop it is a fixed
// column; on a phone it collapses into a top bar with a real menu button (aria-expanded, aria-controls)
// whose links are in the DOM in both layouts, so nothing is hidden from a screen reader. Client-only for
// usePathname and the open state; it takes plain props and imports no runtime code from @/modules.
export type NavItem = {
  href: string;
  label: string;
  detail?: string; // a second line, such as the city's name
  icon: IconName;
  matchPrefixes: string[];
};

export function AppNav({
  items,
  userName,
  userEmail,
  children,
}: {
  items: NavItem[];
  userName: string;
  userEmail: string;
  children: ReactNode; // the page
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <header data-nav className="flex items-center justify-between bg-nav px-4 py-3 text-nav-text lg:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 font-serif text-xl font-bold">
          <Brand />
          UPlan
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="app-nav"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border-2 border-nav-text/40 px-3 text-sm font-semibold"
        >
          <Icon name="menu" />
          Menu
        </button>
      </header>

      <aside
        id="app-nav"
        data-nav
        className={`${open ? "flex" : "hidden"} w-full flex-col justify-between gap-6 bg-nav px-4 py-5 text-nav-text border-r-2 border-nav-text/15 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0`}
      >
        <div className="flex flex-col gap-6">
          <Link href="/dashboard" className="hidden items-center gap-2 px-2 font-serif text-xl font-bold lg:flex">
            <Brand />
            UPlan
          </Link>
          <Link href="/projects/new" className={actionClassName("primary", "w-full")} onClick={() => setOpen(false)}>
            <Icon name="plus" />
            New research
          </Link>
          <nav aria-label="Main">
            <ul className="flex flex-col gap-1">
              {items.map((item) => {
                const active = item.matchPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                        active ? "bg-accent-green font-semibold text-ink" : "text-nav-text hover:bg-white/10"
                      }`}
                    >
                      <Icon name={item.icon} />
                      <span className="flex flex-col leading-tight">
                        {item.label}
                        {item.detail ? <span className={`text-xs font-normal ${active ? "text-ink" : "text-nav-muted"}`}>{item.detail}</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
        <div className="flex items-center gap-3 border-t border-nav-line px-2 pt-4">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-accent-gold text-sm font-bold text-ink"
          >
            {initials(userName)}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{userName}</span>
            <span className="truncate text-xs text-nav-muted">{userEmail}</span>
          </span>
        </div>
      </aside>

      <main id="main" data-on-dark className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">{children}</div>
      </main>
    </div>
  );
}

function Brand() {
  return (
    <span aria-hidden="true" className="text-2xl">
      🌰
    </span>
  );
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .filter((c): c is string => Boolean(c))
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
