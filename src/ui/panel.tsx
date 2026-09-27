import type { ReactNode } from "react";

// The signed-in app's one container: a white surface with a 1px border, a 12px radius, and a single soft
// shadow. An optional title row carries the panel's name and its actions; the body is whatever the caller
// passes. It renders a <section> named by its title, so a screen reader can move between panels.
export function Panel({
  title,
  description,
  actions,
  className = "",
  bodyClassName = "",
  children,
  headingLevel = 2,
  id,
}: {
  title?: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  headingLevel?: 2 | 3;
  id?: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const headingId = id ? `${id}-heading` : undefined;
  return (
    <section
      id={id}
      aria-labelledby={title ? headingId : undefined}
      className={`rounded-xl border border-line bg-surface shadow-panel ${className}`}
    >
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <Heading id={headingId} className="text-base font-semibold text-text">
              {title}
            </Heading>
            {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={`px-5 py-4 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
