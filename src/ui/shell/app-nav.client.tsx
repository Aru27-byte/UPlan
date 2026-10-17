"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";

import { actionClassName } from "../action-styles";
import { Brand } from "../brand";
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
  citySwitcher,
  children,
}: {
  items: NavItem[];
  userName: string;
  userEmail: string;
  citySwitcher: ReactNode; // the City control, built by the server shell (F20 R11)
  children: ReactNode; // the page
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <header className="flex items-center justify-between border-b border-line bg-nav/90 px-4 py-3 text-nav-text backdrop-blur lg:hidden">
        <Link href="/dashboard" className="flex items-center rounded-lg">
          <Brand />
        </Link>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="app-nav"
          onClick={() => setOpen((o) => !o)}
          className={actionClassName("secondary")}
        >
          <Icon name="menu" />
          Menu
        </button>
      </header>

      <aside
        id="app-nav"
        className={`${open ? "flex" : "hidden"} w-full flex-col justify-between gap-6 border-r border-line bg-nav/90 px-4 py-5 text-nav-text backdrop-blur lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0`}
      >
        <div className="flex flex-col gap-6">
          <Link href="/dashboard" className="hidden items-center rounded-lg px-2 lg:flex">
            <Brand />
          </Link>
          <Link href="/projects/new" className={actionClassName("primary", "w-full")} onClick={() => setOpen(false)}>
            <Icon name="plus" />
            New research
          </Link>
          {citySwitcher}
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
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium ${
                        active
                          ? "border-accent-green/45 bg-accent-green/[0.14] font-semibold text-accent-lime"
                          : "border-transparent text-nav-text hover:bg-cream/[0.06]"
                      }`}
                    >
                      <Icon name={item.icon} />
                      <span className="flex flex-col leading-tight">
                        {item.label}
                        {item.detail ? <span className="text-xs font-normal text-nav-muted">{item.detail}</span> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
        <div className="flex items-center gap-3 border-t border-line px-2 pt-4">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-green to-accent-steel text-sm font-bold text-ink"
          >
            {initials(userName)}
          </span>
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium">{userName}</span>
            <span className="truncate text-xs text-nav-muted">{userEmail}</span>
          </span>
        </div>
      </aside>

      <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">{children}</div>
      </main>
    </div>
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
