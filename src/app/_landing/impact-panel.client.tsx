"use client";

import { Button, Disclosure, DisclosureGroup, DisclosurePanel, Heading } from "react-aria-components";

import { Badge } from "@/ui/badge";

// One landing-showcase panel: the impact table, one row per resource, each opening to the rule and
// evidence behind it. Every figure and bar here is invented for the page — it shows the shape of the
// real impact table (impact-analysis.md R1–R6): a measurement for every resource including zero, a
// range where a rule depends on something the map doesn't carry, an approximate flag, and no verdict.
type Row = {
  id: string;
  name: string;
  value: string;
  status: "regulatory" | "approximate";
  /** Bar extent, as a share of the track: solid up to `from`, hatched from `from` to `to` (a range). */
  from: number;
  to: number;
  detail: string;
};

const ROWS: readonly Row[] = [
  {
    id: "wetlands",
    name: "Wetlands",
    value: "0.42 ac",
    status: "approximate",
    from: 12,
    to: 12,
    detail:
      "Mapped wetland area inside the footprint. The boundary is approximate: a site study sets the regulated one, and the flag follows this figure onto the map and into the report.",
  },
  {
    id: "wetland-buffer",
    name: "Wetland buffer",
    value: "0.9–2.4 ac",
    status: "approximate",
    from: 24,
    to: 62,
    detail:
      "The buffer width depends on the wetland's rating, and a map can't say what the rating is. UPlan measures every width the rule could produce and shows the range and what it depends on. It never picks a middle value.",
  },
  {
    id: "streams",
    name: "Streams",
    value: "310 ft",
    status: "regulatory",
    from: 34,
    to: 34,
    detail: "Length of mapped stream inside the footprint, measured in the city's own projection.",
  },
  {
    id: "slopes",
    name: "Steep slopes",
    value: "0.00 ac",
    status: "approximate",
    from: 0,
    to: 0,
    detail:
      "Nothing mapped inside the footprint. A resource with nothing inside still gets a row, with zero, so it can't be overlooked. Zero here describes the map, not the land.",
  },
  {
    id: "canopy",
    name: "Forest canopy",
    value: "3.1 ac",
    status: "regulatory",
    from: 78,
    to: 78,
    detail:
      "Canopy area only. Canopy data shows forest extent, not trunk diameters, so UPlan never counts significant trees. It says plainly that the count needs an on-the-ground inventory.",
  },
];

export function ImpactPanel() {
  return (
    <div className="flex flex-col gap-4">
      <DisclosureGroup defaultExpandedKeys={["wetland-buffer"]} className="flex flex-col gap-2.5">
        {ROWS.map((row) => (
          <Disclosure
            key={row.id}
            id={row.id}
            className="group rounded-xl border-2 border-ink bg-white data-[expanded]:shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            <Heading className="m-0">
              <Button
                slot="trigger"
                className="flex w-full cursor-pointer flex-col gap-2.5 rounded-[0.65rem] px-4 py-3 text-left outline-2 outline-offset-2 outline-transparent data-[focus-visible]:outline-ink"
              >
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold">{row.name}</span>
                  <Badge tone={row.status}>{row.status === "approximate" ? "Approximate" : "Regulatory"}</Badge>
                  <span className="ml-auto font-mono text-base font-semibold tabular-nums">{row.value}</span>
                  <span aria-hidden className="text-ink/75 transition-transform group-data-[expanded]:rotate-180">
                    ▾
                  </span>
                </span>
                <span aria-hidden className="relative h-2.5 rounded-full bg-ink/10">
                  <span className="showcase-grow absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${row.from}%` }} />
                  {row.to > row.from ? (
                    <span
                      className="showcase-grow showcase-range absolute inset-y-0 rounded-r-full"
                      style={{ left: `${row.from}%`, width: `${row.to - row.from}%` }}
                    />
                  ) : null}
                </span>
              </Button>
            </Heading>
            <DisclosurePanel>
              <p className="px-4 pb-4 text-sm leading-relaxed text-ink/80">{row.detail}</p>
            </DisclosurePanel>
          </Disclosure>
        ))}
      </DisclosureGroup>
      <p className="text-xs text-ink/75">
        Computed in the database, and repeatable: the same inputs always give the same numbers. No row says
        &ldquo;acceptable,&rdquo; &ldquo;significant,&rdquo; or &ldquo;minor&rdquo; &mdash; only a quantity, its unit, and what it&rsquo;s
        measured against.
      </p>
    </div>
  );
}
