import Link from "next/link";
import type { ReactNode } from "react";

// The header every signed-in page opens with: an optional breadcrumb, the page's one <h1>, a meta line,
// and the page's actions on the right. Server-safe: no state, no hooks.
export function PageHeader({
  title,
  eyebrow,
  breadcrumb,
  meta,
  status,
  actions,
}: {
  title: string;
  eyebrow?: string;
  breadcrumb?: { href: string; label: string }[];
  meta?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav aria-label="Breadcrumb">
          <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
            {breadcrumb.map((crumb, i) => (
              <li key={crumb.href} className="flex items-center gap-1.5">
                {i > 0 ? <span aria-hidden="true">/</span> : null}
                <Link href={crumb.href} className="rounded text-muted underline-offset-2 hover:text-text hover:underline">
                  {crumb.label}
                </Link>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? <p className="text-xs font-semibold tracking-wide text-brand uppercase">{eyebrow}</p> : null}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-text">{title}</h1>
            {status}
          </div>
          {meta ? <p className="mt-1 text-sm text-muted">{meta}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}
