"use client";

import { useId, useState } from "react";

import { actionClassName } from "@/ui/action-styles";
import { Icon } from "@/ui/icons";
import { StatusLabel } from "@/ui/status-label";

// One regulation under a resource type, already worded and cited on the server: a client component can't
// import the provenance formatter (file-structure-and-imports.md), and every figure must go through it (P1).
export type ResourceTypeRule = { key: string; kind: string; summary: string; citation: string };

export type ResourceTypeItem = {
  key: string;
  label: string;
  ruleSetLabel: string;
  isApproximate: boolean;
  rules: ResourceTypeRule[];
};

function matches(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle);
}

// The profile's resource types as one list of rows, each opening to the regulations beneath it, under a header
// that carries the list's counts, its search, and the Update Regulations action.
export function ResourceTypePanel({
  items,
  resourceTypeCount,
  ruleCount,
}: {
  items: ResourceTypeItem[];
  resourceTypeCount: number;
  ruleCount: number;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const searchId = useId();
  const needle = query.trim().toLowerCase();

  // A row matches by its name; one that matches only through a regulation shows just those regulations, opened.
  const visible = items.flatMap((item) => {
    if (needle === "" || matches(`${item.label} ${item.ruleSetLabel}`, needle)) return [{ item, rules: item.rules, isForced: false }];
    const rules = item.rules.filter((r) => matches(`${r.kind} ${r.summary} ${r.citation}`, needle));
    return rules.length > 0 ? [{ item, rules, isForced: true }] : [];
  });

  const isOpen = (key: string, isForced: boolean) => isForced || open.has(key);
  const areAllOpen = visible.length > 0 && visible.every((v) => isOpen(v.item.key, v.isForced));

  function toggle(key: string) {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleAll() {
    setOpen(areAllOpen ? new Set() : new Set(visible.map((v) => v.item.key)));
  }

  return (
    <section aria-labelledby="resource-types-heading" className="overflow-hidden rounded-xl border-2 border-cream/70 bg-surface text-text shadow-panel">
      <header className="flex flex-col gap-4 border-b-2 border-line bg-canvas px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h2 id="resource-types-heading" className="text-xl font-bold text-text">
              City Resource Types
            </h2>
            <p className="mt-0.5 text-sm text-muted">Each resource type opens to the regulations that apply to it, with their code citations.</p>
          </div>
          <dl className="flex gap-2">
            <Stat label="Resource types" value={resourceTypeCount} />
            <Stat label="Rules" value={ruleCount} />
          </dl>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-56 flex-1">
            <label htmlFor={searchId} className="sr-only">
              Search resource types and regulations
            </label>
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
              <Icon name="search" />
            </span>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search resource types and regulations"
              autoComplete="off"
              className="w-full rounded-lg border-2 border-ink bg-white py-2 pr-3 pl-9 text-sm text-text placeholder:text-muted focus:shadow-[3px_3px_0_0_var(--color-ink)]"
            />
          </div>
          {/* The button's behavior is not specified yet (decided 2026-10-04: details to follow), so it is shown but
              cannot be pressed, rather than appearing to work. */}
          <button type="button" disabled title="Not available yet" className={actionClassName("primary")}>
            <Icon name="refresh" />
            Update Regulations
          </button>
        </div>
      </header>

      <div className="px-5 py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
          <p aria-live="polite">
            {needle === "" ? `${items.length} resource types` : `Showing ${visible.length} of ${items.length} resource types`}
          </p>
          {visible.length > 0 ? (
            <button type="button" onClick={toggleAll} className="rounded font-semibold text-brand underline underline-offset-2 hover:text-brand-strong">
              {areAllOpen ? "Collapse all" : "Expand all"}
            </button>
          ) : null}
        </div>

        {visible.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-line px-4 py-8 text-center">
            <p className="text-sm font-medium text-text">No resource type or regulation matches “{query.trim()}”.</p>
            <button type="button" onClick={() => setQuery("")} className={`${actionClassName("secondary")} mt-3`}>
              Clear search
            </button>
          </div>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {visible.map(({ item, rules, isForced }) => (
              <ResourceTypeRow
                key={item.key}
                item={item}
                rules={rules}
                isOpen={isOpen(item.key, isForced)}
                isFiltered={isForced}
                onToggle={() => toggle(item.key)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border-2 border-ink bg-white px-4 py-1.5 text-center shadow-button">
      <dt className="eyebrow text-muted">{label}</dt>
      <dd className="text-2xl leading-tight font-bold text-text">{value}</dd>
    </div>
  );
}

function ResourceTypeRow({
  item,
  rules,
  isOpen,
  isFiltered,
  onToggle,
}: {
  item: ResourceTypeItem;
  rules: ResourceTypeRule[];
  isOpen: boolean;
  isFiltered: boolean;
  onToggle: () => void;
}) {
  const bodyId = useId();
  return (
    <li className={`overflow-hidden rounded-lg border-2 bg-surface ${isOpen ? "border-ink" : "border-line"}`}>
      <h3>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={bodyId}
          onClick={onToggle}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left hover:bg-canvas"
        >
          <span className={`transition-transform motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`}>
            <Icon name="chevron-down" />
          </span>
          <span className="min-w-0 flex-1 text-base font-semibold text-text">{item.label}</span>
          <span className="text-xs font-medium text-muted">{item.ruleSetLabel}</span>
          <StatusLabel tone={item.isApproximate ? "warn" : "neutral"}>
            {item.isApproximate ? "Approximate boundary" : "Regulatory boundary"}
          </StatusLabel>
          <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-xs font-bold text-brand-strong">
            {item.rules.length === 1 ? "1 rule" : `${item.rules.length} rules`}
          </span>
        </button>
      </h3>
      <div id={bodyId} hidden={!isOpen} className="border-t-2 border-line bg-canvas px-4 py-3">
        {item.rules.length === 0 ? (
          // P2: an empty list is a fact about the profile, not a clearance.
          <p className="text-sm text-muted">No buffer, study-trigger, or tree rule is recorded for this resource type.</p>
        ) : (
          <>
            {isFiltered ? <p className="mb-2 text-xs font-medium text-muted">Showing {rules.length} of {item.rules.length} rules that match.</p> : null}
            <ul className="flex flex-col divide-y divide-line">
              {rules.map((rule) => (
                <li key={rule.key} className="flex flex-col gap-1 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-baseline sm:gap-4">
                  <span className="w-32 shrink-0 text-xs font-bold tracking-wide text-brand uppercase">{rule.kind}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text">{rule.summary}</p>
                    <p className="text-xs text-muted">{rule.citation}</p>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </li>
  );
}
