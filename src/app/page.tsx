import Link from "next/link";

import { actionClassName } from "@/ui/action-styles";
import { Backdrop } from "@/ui/backdrop";
import { Brand } from "@/ui/brand";
import type { LngLatBounds } from "@/ui/geo-bounds";
import { LandingMap } from "@/ui/landing-map.client";

import { FeatureShowcase } from "./_landing/feature-showcase.client";

const BASEMAP_URL = "/basemap/basemap.pmtiles";
// The Sammamish jurisdiction boundary scripts/seed-local.ts seeds — inside the committed extract's
// bounds (-122.10,47.50,-121.90,47.70), so every tile this view needs is present.
const SAMMAMISH_BOUNDS: LngLatBounds = [
  [-122.06, 47.55],
  [-121.96, 47.65],
];

// The hero window's readout. Invented figures, the same ones the impact panel below uses, shown in the shape of
// the real impact table: a quantity and its unit, a range where a rule depends on what the map can't show, and
// no verdict. The caption under the window says so.
const READOUT = [
  { name: "Wetlands", value: "0.42 ac", swatch: "bg-accent-blue" },
  { name: "Wetland buffer", value: "0.9–2.4 ac", swatch: "bg-accent-steel" },
  { name: "Streams", value: "310 ft", swatch: "bg-accent-teal" },
  { name: "Forest canopy", value: "3.1 ac", swatch: "bg-accent-green" },
] as const;

// Class names are written out in full because Tailwind finds them by scanning the source.
const STATS = [
  { value: "6", label: "Critical area types", tone: "border-accent-gold/50 from-accent-gold/[0.18] text-accent-gold" },
  { value: "1", label: "Pilot city", tone: "border-accent-blue/50 from-accent-blue/[0.18] text-accent-blue" },
  { value: "100%", label: "Of figures sourced", tone: "border-accent-green/55 from-accent-green/[0.2] text-accent-lime" },
  { value: "0", label: "Verdicts rendered", tone: "border-cream/40 from-cream/[0.12] text-cream" },
] as const;

const REASONS = [
  {
    title: "Stop rebuilding evidence by hand",
    text: "Every decision used to start from a blank map. UPlan gathers and reconciles the public record once, for every study area.",
    tone: "border-accent-butter/45 border-t-accent-butter from-accent-butter/[0.16] text-accent-butter",
    icon: <path d="M4 7h16M4 12h16M4 17h10" />,
  },
  {
    title: "See the real tradeoff",
    text: "Know exactly what a proposal would remove or disturb, resource by resource, before anyone has to guess.",
    tone: "border-accent-lime/45 border-t-accent-lime from-accent-lime/[0.16] text-accent-lime",
    icon: <path d="M12 3v18M5 8l-3 6h6zM19 8l-3 6h6zM5 8h14" />,
  },
  {
    title: "Catch problems before filing",
    text: "Flag the critical areas a site likely touches at the pre-application conference, so the right studies are named early.",
    tone: "border-accent-blue/45 border-t-accent-blue from-accent-blue/[0.16] text-accent-blue",
    icon: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5M11 8v3.5M11 14v.01" />
      </>
    ),
  },
  {
    title: "Hand over a report that holds up",
    text: "Locked once released and sourced on every figure, built to survive being forwarded, printed, and quoted out of context.",
    tone: "border-accent-gold/50 border-t-accent-gold from-accent-gold/[0.18] text-accent-gold",
    icon: <path d="M6 3h9l3 3v15H6zM9 12l2 2 4-4" />,
  },
] as const;

const STEPS = [
  {
    title: "Draw the study area",
    text: "Draw, upload, or load the boundary, and see every mapped layer at once.",
    tone: "border-accent-gold/50 border-t-accent-gold from-accent-gold/[0.16]",
    chip: "bg-accent-gold",
  },
  {
    title: "Assemble the evidence",
    text: "Public datasets mapped over the study area, each with its source, date, and confidence.",
    tone: "border-accent-lime/50 border-t-accent-lime from-accent-lime/[0.16]",
    chip: "bg-accent-lime",
  },
  {
    title: "Trace the proposal",
    text: "Trace on the map what the plan would clear, grade, or build.",
    tone: "border-accent-blue/50 border-t-accent-blue from-accent-blue/[0.16]",
    chip: "bg-accent-blue",
  },
  {
    title: "Measure the impact",
    text: "What the footprint would remove or disturb, for each resource and buffer, under the city’s rules.",
    tone: "border-accent-tan/55 border-t-accent-tan from-accent-tan/[0.18]",
    chip: "bg-accent-tan",
  },
  {
    title: "Release the report",
    text: "Reviewed phase by phase, then released as a locked, fully cited document.",
    tone: "border-accent-green/60 border-t-accent-green from-accent-green/[0.22]",
    chip: "bg-accent-green",
  },
] as const;

// Sammamish's six regulated critical area types (charter, "Pilot context").
const COVERAGE = [
  { name: "Wetlands", tone: "border-accent-blue/45 bg-accent-blue/[0.13]", swatch: "bg-accent-blue" },
  { name: "Streams", tone: "border-accent-steel/60 bg-accent-steel/[0.18]", swatch: "bg-accent-steel" },
  { name: "Habitat conservation areas and migration corridors", tone: "border-accent-lime/45 bg-accent-lime/[0.13]", swatch: "bg-accent-lime" },
  { name: "Geologically hazardous areas", tone: "border-accent-tan/50 bg-accent-tan/[0.15]", swatch: "bg-accent-tan" },
  { name: "Critical aquifer recharge areas", tone: "border-accent-gold/45 bg-accent-gold/[0.13]", swatch: "bg-accent-gold" },
  { name: "Frequently flooded areas", tone: "border-accent-teal/50 bg-accent-teal/[0.14]", swatch: "bg-accent-teal" },
] as const;

const PRINCIPLES = [
  { text: "Provenance on every figure", tone: "border-accent-gold/40 bg-accent-gold/[0.08] text-accent-gold" },
  { text: "Never clears land", tone: "border-accent-lime/40 bg-accent-lime/[0.08] text-accent-lime" },
  { text: "Never makes the call", tone: "border-accent-blue/40 bg-accent-blue/[0.08] text-accent-blue" },
] as const;

const SECTION = "relative mx-auto max-w-[1200px] px-6";
const H2 = "font-display font-extrabold leading-[1.05] tracking-[-0.03em] text-heading";

function Arrow() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// The public, signed-out home page. No requireActor() call: this page is exempt from src/proxy.ts's sign-in
// redirect and must render for anyone. Copy here is static marketing text, not a live query — there is no
// signed-in actor to query anything as. Every claim on it is the charter's.
export default function LandingPage() {
  return (
    <div className="relative isolate overflow-hidden">
      <Backdrop className="absolute" />

      <header className="relative border-b border-line">
        <nav aria-label="Main" className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-5 px-6 py-4.5">
          <Link href="/" className="rounded-lg">
            <Brand />
          </Link>
          <ul className="hidden items-center gap-7 text-sm font-medium md:flex">
            {[
              ["#product", "Product"],
              ["#how", "How it works"],
              ["#coverage", "Coverage"],
              ["#principles", "Principles"],
            ].map(([href, label]) => (
              <li key={href}>
                <a href={href} className="rounded text-muted hover:text-accent-gold">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2.5">
            <Link href="/sign-in" className="flex min-h-11 items-center rounded-full px-3.5 text-sm font-semibold text-text hover:text-accent-gold">
              Sign in
            </Link>
            <Link href="/sign-in" className={actionClassName("primary", "min-h-11")}>
              Launch UPlan
              <Arrow />
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className={`${SECTION} pt-16 pb-10 text-center sm:pt-22`}>
          <p className="mb-7 inline-flex flex-wrap items-center justify-center gap-2.5 rounded-full border border-accent-green/45 bg-accent-green/10 py-1.5 pr-3.5 pl-1.5 font-mono text-xs text-[#d9efc0]">
            <span className="rounded-full bg-accent-green px-2.5 py-0.5 font-bold text-ink uppercase">Pilot</span>
            Piloting with the City of Sammamish, WA
          </p>
          <h1 className="mx-auto mb-6 max-w-[960px] font-display text-[clamp(2.75rem,7vw,5.75rem)] leading-[0.98] font-extrabold tracking-[-0.035em] text-heading">
            Develop <span className="text-accent-green">or</span> preserve.{" "}
            <span className="block text-accent-gold">Decide with the evidence.</span>
          </h1>
          <p className="mx-auto mb-9 max-w-[640px] text-[clamp(1rem,1.6vw,1.1875rem)] leading-relaxed text-[#dcd6c4]">
            UPlan helps municipal planners assemble the evidence behind decisions to develop forests and other habitat,
            and lay out the tradeoff clearly enough to withstand scrutiny.
          </p>
          <div className="mb-16 flex flex-wrap justify-center gap-3">
            <Link href="/sign-in" className={actionClassName("primary", "shadow-glow", "lg")}>
              Start a study area
              <Arrow />
            </Link>
            <a href="#how" className={actionClassName("secondary", "", "lg")}>
              See how it works
            </a>
          </div>

          <div id="product" className="frame-glow mx-auto max-w-[1080px] scroll-mt-6 text-left">
            <div className="frame-bar justify-between">
              <span aria-hidden="true" className="flex gap-1.5">
                <i className="size-[11px] rounded-full bg-[#4a3e24]" />
                <i className="size-[11px] rounded-full bg-[#4a3e24]" />
                <i className="size-[11px] rounded-full bg-[#4a3e24]" />
              </span>
              <span className="font-mono text-xs text-muted">Sample subdivision · Sammamish, WA</span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-accent-lime">
                <span aria-hidden="true" className="size-[7px] rounded-full bg-accent-lime shadow-[0_0_10px_var(--color-accent-lime)]" />
                Impact engine
              </span>
            </div>

            <div className="grid md:grid-cols-2">
              <div className="flex flex-col gap-4 border-b border-line p-6 md:border-r md:border-b-0">
                <p className="eyebrow text-muted">What the footprint would disturb</p>
                <ul className="flex flex-col gap-2">
                  {READOUT.map((row) => (
                    <li key={row.name} className="flex items-center justify-between gap-3 rounded-[10px] border border-line bg-canvas px-3 py-2.5">
                      <span className="flex items-center gap-2.5 text-sm">
                        <span aria-hidden="true" className={`size-[9px] rounded-[3px] ${row.swatch}`} />
                        {row.name}
                      </span>
                      <span className="font-mono text-xs text-text">{row.value}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm leading-relaxed text-[#dcd6c4]">
                  Each figure is measured in the database against the city&rsquo;s rules, and linked to its source.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {["Publisher", "Source date", "Retrieved"].map((chip) => (
                    <span key={chip} className="rounded-md border border-accent-gold/35 px-2 py-0.5 font-mono text-[11px] text-accent-gold">
                      {chip}
                    </span>
                  ))}
                  <span className="rounded-md border border-accent-blue/35 px-2 py-0.5 font-mono text-[11px] text-accent-blue">
                    Confidence: stated in words
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3 p-6">
                <div className="flex items-center justify-between">
                  <p className="eyebrow text-muted">Study area · Map</p>
                  <p className="font-mono text-[11px] text-accent-lime">Sammamish, WA</p>
                </div>
                <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-line bg-[#1e2716]">
                  <LandingMap basemapUrl={BASEMAP_URL} bounds={SAMMAMISH_BOUNDS} />
                </div>
              </div>
            </div>
          </div>
          <p className="mt-4 text-xs text-faint">
            Illustrative example. The map is Sammamish, Washington; the figures are invented to show the shape of the
            impact table.
          </p>
        </section>

        <section aria-label="UPlan at a glance" className={`${SECTION} py-10`}>
          <ul className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            {STATS.map((stat) => (
              <li key={stat.label} className={`rounded-[18px] border bg-gradient-to-br to-transparent px-6 py-6.5 shadow-panel ${stat.tone}`}>
                <p className="font-display text-[2.75rem] leading-none font-extrabold">{stat.value}</p>
                <p className="eyebrow mt-2 text-muted">{stat.label}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="why-heading" className={`${SECTION} pt-20 pb-10`}>
          <p className="eyebrow mb-3.5 text-accent-green">Why UPlan</p>
          <h2 id="why-heading" className={`${H2} mb-11 max-w-[720px] text-[clamp(2rem,4vw,3.25rem)]`}>
            The research a decision needs, done once and done right.
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {REASONS.map((reason) => (
              <li key={reason.title} className={`rounded-[18px] border border-t-4 bg-gradient-to-b to-transparent p-6.5 shadow-panel ${reason.tone}`}>
                <span aria-hidden="true" className="mb-5 flex size-11 items-center justify-center rounded-xl border border-current/35 bg-current/10">
                  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    {reason.icon}
                  </svg>
                </span>
                <h3 className="mb-2.5 font-display text-xl font-bold text-heading">{reason.title}</h3>
                <p className="text-[0.90625rem] leading-relaxed text-muted">{reason.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="showcase-heading" className={`${SECTION} pt-20 pb-10`}>
          <div className="mb-11 max-w-3xl">
            <p className="eyebrow mb-3.5 text-accent-gold">What&rsquo;s inside</p>
            <h2 id="showcase-heading" className={`${H2} text-[clamp(2rem,4vw,3.25rem)]`}>
              From scattered evidence to a report that holds up
            </h2>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
              Six things UPlan does that a pile of public maps can&rsquo;t. Pick one and try it.
            </p>
          </div>
          <FeatureShowcase />
        </section>

        <section id="how" aria-labelledby="how-heading" className={`${SECTION} scroll-mt-6 pt-20 pb-10`}>
          <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
            <div>
              <p className="eyebrow mb-3.5 text-accent-blue">How it works</p>
              <h2 id="how-heading" className={`${H2} max-w-[640px] text-[clamp(2rem,4vw,3.25rem)]`}>
                From a blank map to a released report in five steps.
              </h2>
            </div>
            <p className="max-w-[380px] text-[0.9375rem] leading-relaxed text-muted">
              UPlan&rsquo;s engine gathers, reconciles, and measures. Planners stay in charge of every judgment call.
            </p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {STEPS.map((step, index) => (
              <li key={step.title} className={`rounded-2xl border border-t-4 bg-gradient-to-b to-transparent p-5.5 shadow-panel ${step.tone}`}>
                <span aria-hidden="true" className={`mb-5.5 flex size-[34px] items-center justify-center rounded-full font-mono text-xs font-bold text-ink ${step.chip}`}>
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mb-2 font-display text-lg font-bold text-heading">{step.title}</h3>
                <p className="text-[0.84375rem] leading-relaxed text-muted">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="coverage" aria-labelledby="coverage-heading" className={`${SECTION} scroll-mt-6 pt-20 pb-10`}>
          <div className="grid items-center gap-10 rounded-3xl border border-line bg-surface p-[clamp(1.5rem,4vw,3rem)] md:grid-cols-2">
            <div>
              <p className="eyebrow mb-3.5 text-accent-gold">Coverage</p>
              <h2 id="coverage-heading" className={`${H2} mb-4 text-[clamp(1.75rem,3.4vw,2.75rem)]`}>
                Six critical area types, read straight from the source.
              </h2>
              <p className="text-[0.9375rem] leading-relaxed text-muted">
                Nothing claims more precision than its data has. When a dataset is coarse or dated, UPlan says so next to
                the figure.
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {COVERAGE.map((area, index) => (
                <li key={area.name} className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 ${area.tone}`}>
                  <span className="flex items-center gap-2.5 text-sm font-semibold">
                    <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-[3px] ${area.swatch}`} />
                    {area.name}
                  </span>
                  <span aria-hidden="true" className="font-mono text-[11px] text-faint">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="principles" aria-labelledby="principles-heading" className={`${SECTION} scroll-mt-6 pt-22 pb-10 text-center`}>
          <h2 id="principles-heading" className={`${H2} mx-auto mb-7 max-w-[860px] text-[clamp(2.125rem,5vw,4rem)] tracking-[-0.035em]`}>
            Helps you help the <span className="text-accent-green">environment</span>.
          </h2>
          <p className="mx-auto mb-7 max-w-2xl text-[0.9375rem] leading-relaxed text-muted">
            UPlan lays out the evidence and the tradeoff. The decision stays with the people who make it.
          </p>
          <ul className="flex flex-wrap justify-center gap-2.5">
            {PRINCIPLES.map((p) => (
              <li key={p.text} className={`rounded-full border px-3.5 py-2 font-mono text-xs font-bold uppercase ${p.tone}`}>
                {p.text}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="launch-heading" className={`${SECTION} pt-15 pb-20`}>
          <div className="relative flex flex-wrap items-center justify-between gap-8 overflow-hidden rounded-[28px] border border-accent-green/45 bg-[#1f2a15] p-[clamp(2rem,5vw,4rem)]">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-50 -right-30 size-130 rounded-full bg-[radial-gradient(closest-side,rgb(130_180_90/0.35),transparent_70%)]"
            />
            <div className="relative max-w-[620px]">
              <h2 id="launch-heading" className={`${H2} mb-3 text-[clamp(1.75rem,3.6vw,2.875rem)]`}>
                Bring the evidence to your next pre-application conference.
              </h2>
              <p className="leading-relaxed text-[#dcd6c4]">
                Piloted with the City of Sammamish, Washington. Sign in with your UPlan account to get started.
              </p>
            </div>
            <div className="relative flex flex-wrap gap-3">
              <Link href="/sign-in" className={actionClassName("primary", "", "lg")}>
                Launch UPlan
                <Arrow />
              </Link>
              <Link href="/register" className={actionClassName("secondary", "", "lg")}>
                Register
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-line">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-4 px-6 py-7 font-mono text-xs text-faint">
          <span className="flex items-center gap-3">
            <Brand size="sm" />
            <span className="uppercase">Piloted with the City of Sammamish, Washington</span>
          </span>
          <Link href="/sign-in" className="rounded font-bold text-accent-gold uppercase hover:text-accent-lime">
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}
