"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

import { Icon } from "@/ui/icons";

type View = "settings" | "sources";

const VIEWS: { id: View; label: string }[] = [
  { id: "settings", label: "Settings" },
  { id: "sources", label: "Sources" },
];

// The profile's settings and sources, in a panel that slides in from the right over a native <dialog>: the
// browser traps focus, closes it on Escape, and returns focus to the gear that opened it. Both views are
// rendered by the server and passed in; the hidden one stays mounted, so what someone has typed into it is not
// lost when they switch tabs.
export function ProfileFlyout({ settings, sources, sourceCount }: { settings: ReactNode; sources: ReactNode; sourceCount: number }) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [view, setView] = useState<View>("settings");
  const titleId = useId();
  const baseId = useId();

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = view === "settings" ? "sources" : "settings";
    setView(next);
    document.getElementById(`${baseId}-tab-${next}`)?.focus();
  }

  return (
    <>
      <button
        type="button"
        aria-label="Profile settings"
        aria-haspopup="dialog"
        title="Profile settings"
        onClick={() => dialogRef.current?.showModal()}
        className="inline-flex size-11 items-center justify-center rounded-lg border-2 border-accent-gold text-accent-gold hover:bg-accent-gold hover:text-ink [&_svg]:size-5"
      >
        <Icon name="gear" />
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself; one inside lands on a child.
          if (event.target === event.currentTarget) dialogRef.current?.close();
        }}
        className="flyout m-0 ml-auto h-dvh max-h-none w-[min(34rem,100vw)] max-w-none border-l-2 border-ink bg-canvas p-0 text-text backdrop:bg-black/55"
      >
        <div className="flex h-full flex-col">
          <header className="bg-nav px-5 pt-4 text-nav-text">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow text-accent-gold">City profile</p>
                <h2 id={titleId} className="text-xl font-bold">
                  Profile settings
                </h2>
              </div>
              <button
                type="button"
                aria-label="Close profile settings"
                onClick={() => dialogRef.current?.close()}
                className="inline-flex size-9 items-center justify-center rounded-lg border-2 border-nav-line text-nav-text hover:border-accent-gold hover:text-accent-gold"
              >
                <Icon name="close" />
              </button>
            </div>

            <div role="tablist" aria-label="Profile settings sections" className="mt-4 flex gap-1">
              {VIEWS.map((v) => {
                const isActive = v.id === view;
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="tab"
                    id={`${baseId}-tab-${v.id}`}
                    aria-selected={isActive}
                    aria-controls={`${baseId}-panel-${v.id}`}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setView(v.id)}
                    onKeyDown={onTabKeyDown}
                    className={`inline-flex items-center gap-2 rounded-t-lg border-x-2 border-t-2 px-4 py-2 text-sm font-semibold ${
                      isActive ? "border-canvas bg-canvas text-text" : "border-transparent text-nav-muted hover:text-nav-text"
                    }`}
                  >
                    {v.label}
                    {v.id === "sources" ? (
                      <span className={`rounded-full px-2 text-xs font-bold ${isActive ? "bg-brand-soft text-brand-strong" : "bg-nav-line text-nav-text"}`}>
                        {sourceCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div
              role="tabpanel"
              id={`${baseId}-panel-settings`}
              aria-labelledby={`${baseId}-tab-settings`}
              hidden={view !== "settings"}
              className="px-5 py-5"
            >
              {settings}
            </div>
            <div
              role="tabpanel"
              id={`${baseId}-panel-sources`}
              aria-labelledby={`${baseId}-tab-sources`}
              hidden={view !== "sources"}
              className="px-5 py-5"
            >
              {sources}
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
