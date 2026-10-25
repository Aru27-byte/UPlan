import Link from "next/link";

import { actionClassName } from "@/ui/action-styles";
import { Backdrop } from "@/ui/backdrop";
import { Brand } from "@/ui/brand";

import { HowItWorks } from "./_landing/how-it-works.client";

const COVERAGE = [
  {
    name: "Wetlands",
    note: "Rating-based buffers, from the city's own code.",
    tone: "border-accent-blue/45 bg-accent-blue/[0.1]",
    swatch: "bg-accent-blue",
  },
  {
    name: "Streams",
    note: "Typed by fish habitat and flow regime.",
    tone: "border-accent-steel/60 bg-accent-steel/[0.14]",
    swatch: "bg-accent-steel",
  },
  {
    name: "Habitat conservation areas and migration corridors",
    note: "Mapped habitat and the routes between it.",
    tone: "border-accent-lime/45 bg-accent-lime/[0.1]",
    swatch: "bg-accent-lime",
  },
  {
    name: "Geologically hazardous areas",
    note: "Slope, seismic, and erosion hazards.",
    tone: "border-accent-tan/50 bg-accent-tan/[0.12]",
    swatch: "bg-accent-tan",
  },
  {
    name: "Critical aquifer recharge areas",
    note: "Where the city's drinking water refills.",
    tone: "border-accent-gold/45 bg-accent-gold/[0.1]",
    swatch: "bg-accent-gold",
  },
  {
    name: "Frequently flooded areas",
    note: "Floodplain and floodway boundaries.",
    tone: "border-accent-teal/50 bg-accent-teal/[0.12]",
    swatch: "bg-accent-teal",
  },
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

export default function LandingPage() {
  return (
    <div className="relative isolate overflow-x-clip">
      <Backdrop className="absolute" />

      <header className="sticky top-0 z-40 border-b border-line bg-page/75 backdrop-blur-xl">
        <nav aria-label="Main" className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-5 px-6 py-4.5">
          <Link href="/" className="flex items-center gap-3 rounded-lg transition-opacity duration-200 hover:opacity-85">
            <Brand />
            <span className="font-mono text-[9px] tracking-[0.12em] text-faint uppercase sm:text-[10px] sm:tracking-[0.16em]">
              Built for municipal planners
            </span>
          </Link>
          <ul className="hidden items-center gap-7 text-sm font-medium md:flex">
            {[
              ["#how", "How It Works"],
              ["#coverage", "Coverage"],
              ["#principles", "Principles"],
            ].map(([href, label]) => (
              <li key={href}>
                <a href={href} className="nav-link rounded p-0.5 text-muted transition-colors duration-200 hover:text-accent-gold">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2.5">
            <Link href="/sign-in" className="flex min-h-11 items-center rounded-full px-3.5 text-sm font-semibold text-text transition-colors duration-200 hover:text-accent-gold">
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
        {/* 1 — Landing: the headline and the two ways in. */}
        <section className={`${SECTION} pt-16 pb-10 text-center sm:pt-22`}>
          <h1 className="enter-up mx-auto mb-6 max-w-[960px] font-display text-[clamp(2.75rem,7vw,5.75rem)] leading-[0.98] font-extrabold tracking-[-0.035em] text-heading [animation-delay:80ms]">
            Develop <span className="text-accent-green">or</span> Preserve ?{" "}
            <span className="block text-accent-gold">Decide with UPlan Assist.</span>
          </h1>
          <p className="enter-up mx-auto mb-9 max-w-[640px] text-[clamp(1rem,1.6vw,1.1875rem)] leading-relaxed text-[#dcd6c4] [animation-delay:160ms]">
            UPlan helps municipal planners assemble the evidence behind decisions to develop forests and other habitat,
            and lay out the tradeoff clearly enough to withstand scrutiny.
          </p>
          <div className="enter-up mb-0 flex flex-wrap justify-center gap-3 [animation-delay:240ms]">
            <Link href="/sign-in" className={actionClassName("primary", "shadow-glow", "lg")}>
              Start a project
              <Arrow />
            </Link>
            <a href="#how" className={actionClassName("secondary", "", "lg")}>
              See how it works
            </a>
          </div>
        </section>

        {/* 2 — How it works: four phases, each with its own demo and a constant Assist column. */}
        <HowItWorks />

        {/* 3 — Coverage: the six types, plus how a city's regulations get in. */}
        <section id="coverage" aria-labelledby="coverage-heading" className={`${SECTION} scroll-mt-20 pt-16 pb-10`}>
          <div className="mb-10 max-w-3xl">
            <h2 id="coverage-heading" className={`${H2} text-[clamp(2rem,4vw,3.25rem)]`}>
              Six critical area types, read from the city&rsquo;s own record.
            </h2>
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-muted">
              UPlan never claims more precision than a dataset has. When a boundary is coarse or dated, the figure says
              so &mdash; and the city&rsquo;s profile decides which rules apply.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <ul className="grid gap-3 sm:grid-cols-2">
              {COVERAGE.map((area, index) => (
                <li key={area.name} className={`lift rounded-2xl border bg-gradient-to-br to-transparent p-4 shadow-panel ${area.tone}`}>
                  <div className="flex items-start justify-between gap-3">
                    <span aria-hidden className={`mt-0.5 size-3 shrink-0 rounded-[3px] ${area.swatch}`} />
                    <span className="font-mono text-[10px] text-faint">{String(index + 1).padStart(2, "0")}</span>
                  </div>
                  <h3 className="mt-3 font-display text-base leading-snug font-bold text-heading">{area.name}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{area.note}</p>
                </li>
              ))}
            </ul>

            <div className="rounded-3xl border border-line bg-surface p-[clamp(1.25rem,3vw,2rem)]">
              <h3 className="font-display text-xl font-bold text-heading">Regulations travel with the city.</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                A city&rsquo;s categories, buffers, and study triggers live in a jurisdiction profile &mdash; configuration,
                not code. Planners upload the profile from a spreadsheet and choose how each boundary is treated.
              </p>

              <ul className="mt-4 flex flex-col gap-2 text-sm text-text">
                {[
                  "Every rule cites its code section and the date it took effect.",
                  "Regulatory boundaries are solid; approximate ones are hatched, never color alone.",
                  "A study the profile names is never removed by an empty map.",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent-lime" />
                    <span className="leading-relaxed">{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* 4 — Principles, then the unchanged green launch box. */}
        <section id="principles" aria-labelledby="principles-heading" className={`${SECTION} scroll-mt-20 pt-22 pb-6 text-center`}>
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

        <section aria-labelledby="launch-heading" className={`${SECTION} pt-6 pb-20`}>
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
                Sign in with your UPlan account to get started.
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
    </div>
  );
}
