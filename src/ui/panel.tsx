import type { ReactNode } from "react";

// The one container in UPlan: a dark surface with a thin gold edge, an 18px radius, and a deep soft shadow. An
// optional title row carries the panel's name and its actions; the body is whatever the caller passes. It
// renders a <section> named by its title, so a screen reader can move between panels.
export const panelClassName = "rounded-[18px] border border-line bg-surface text-text shadow-panel";

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
    <section id={id} aria-labelledby={title ? headingId : undefined} className={`${panelClassName} ${className}`}>
      {title ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <Heading id={headingId} className="font-display text-lg font-bold tracking-tight text-heading">
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
