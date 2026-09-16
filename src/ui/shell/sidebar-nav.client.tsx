"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// UIDesign/Dashboard.png — the sidebar's nav list, with the current section highlighted green.
// Client-only for usePathname(); takes plain data as props, no @/modules or @/platform import
// (file-structure-and-imports.md).
export type NavItem = { href: string; label: string };

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-lg px-4 py-2 font-medium ${
              active ? "card-sticker bg-accent-green text-ink" : "text-sidebar-foreground hover:bg-white/10"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
