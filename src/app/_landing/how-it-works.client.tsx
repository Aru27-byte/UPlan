"use client";

import { useRef, useState, type ComponentType, type ReactNode } from "react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";

import { AnalyzeDemo } from "./how-it-works/analyze-demo.client";
import { AssembleDemo } from "./how-it-works/assemble-demo.client";
import { AssistChat } from "./how-it-works/assist-chat.client";
import { ReportDemo } from "./how-it-works/report-demo.client";
import { SetupDemo } from "./how-it-works/setup-demo.client";

type Phase = {
  id: string;
  number: string;
  title: string;
  sentence: string;
  windowTitle: string;
  accent: string;
  soft: string;
  bar: string;
  border: string;
  Demo: ComponentType;
  icon: ReactNode;
};

const PHASES: readonly Phase[] = [
  {
    id: "setup",
    number: "01",
    title: "Set up the study area",
    sentence:
      "Draw the boundary and bring every mapped layer into one workspace, with each layer's source attached.",
    windowTitle: "Map workspace",
    accent: "text-accent-gold",
    soft: "bg-accent-gold/15",
    bar: "bg-accent-gold",
    border: "border-accent-gold/35",
    Demo: SetupDemo,
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3 3 5.5v15L9 18l6 3 6-2.5v-15L15 6 9 3Z" />
        <path d="M9 3v15M15 6v15" />
      </svg>
    ),
  },
  {
    id: "assemble",
    number: "02",
    title: "Assemble the evidence",
    sentence:
      "Reconcile the public record into one evidence base, with gaps and disagreements stated rather than smoothed over.",
    windowTitle: "Evidence base",
    accent: "text-accent-lime",
    soft: "bg-accent-lime/15",
    bar: "bg-accent-lime",
    border: "border-accent-lime/35",
    Demo: AssembleDemo,
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" />
        <path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" />
      </svg>
    ),
  },
  {
    id: "analyze",
    number: "03",
    title: "Analyze what it touches",
    sentence:
      "Screen the mapped record, name the studies it flags, and measure the footprint's impact resource by resource.",
    windowTitle: "Analysis",
    accent: "text-accent-blue",
    soft: "bg-accent-blue/15",
    bar: "bg-accent-blue",
    border: "border-accent-blue/35",
    Demo: AnalyzeDemo,
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    id: "report",
    number: "04",
    title: "Write and release the report",
    sentence:
      "Turn the analysis into a cited document, then release it locked and provably unaltered.",
    windowTitle: "Report",
    accent: "text-accent-green",
    soft: "bg-accent-green/15",
    bar: "bg-accent-green",
    border: "border-accent-green/35",
    Demo: ReportDemo,
    icon: (
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3h9l3 3v15H6V3Z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    ),
  },
] as const;

function DemoWindow({ title, className = "", children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <div className={`frame-glow flex min-h-0 flex-col overflow-hidden text-text ${className}`}>
      <div className="frame-bar justify-between">
        <span aria-hidden className="flex gap-1.5">
          <i className="size-[10px] rounded-full bg-[#4a3e24]" />
          <i className="size-[10px] rounded-full bg-[#4a3e24]" />
          <i className="size-[10px] rounded-full bg-[#4a3e24]" />
        </span>
        <span className="font-mono text-[11px] text-muted">{title}</span>
        <span className="badge">Illustrative example</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3.5 sm:p-4">{children}</div>
    </div>
  );
}

function TitleCard({ phase, active }: { phase: Phase; active: boolean }) {
  return (
    <article
      className={`overflow-hidden rounded-2xl border bg-surface/95 shadow-panel backdrop-blur ${phase.border}`}
    >
      <div className={`h-1 w-full ${phase.bar}`} />
      <div className="p-5">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex size-9 items-center justify-center rounded-lg ${phase.soft} ${phase.accent}`}
          >
            {phase.icon}
          </span>
          <span className="font-mono text-[11px] tracking-[0.1em] text-faint uppercase">
            Phase {phase.number}
          </span>
          {active ? (
            <span className="ml-auto size-2 rounded-full bg-accent-green shadow-[0_0_10px_var(--color-accent-green)]" />
          ) : null}
        </div>
        <h3 className="mt-4 font-display text-xl leading-tight font-bold text-heading">
          {phase.title}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{phase.sentence}</p>
      </div>
    </article>
  );
}

function PhaseSection({ phase }: { phase: Phase }) {
  return (
    <div className="flex flex-col gap-4">
      <TitleCard phase={phase} active />
      <DemoWindow title={phase.windowTitle} className="min-h-[520px]">
        <phase.Demo />
      </DemoWindow>
    </div>
  );
}

export function HowItWorks() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: scrollRef,
    offset: ["start start", "end end"],
  });
  const [active, setActive] = useState(0);

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    const next = Math.min(
      PHASES.length - 1,
      Math.max(0, Math.floor(value * PHASES.length)),
    );
    setActive((current) => (current === next ? current : next));
  });

  return (
    <section id="how" aria-labelledby="how-heading" className="relative scroll-mt-20 pt-20 pb-4">
      <div className="mx-auto max-w-[1200px] px-6">
        <h2
          id="how-heading"
          className=" font-display text-[clamp(2rem,4vw,3.25rem)] leading-[1.05] font-extrabold tracking-[-0.03em] text-heading"
        >
          From a <span className="text-accent-gold">drawn</span> boundary to a <span className="text-accent-gold">released</span> report.
        </h2>
        <p className="mt-2 max-w-[560px] text-[0.9375rem] leading-relaxed text-muted">
          Four phases. Each one produces a section the final document will print &mdash; and UPlan
          Assist stays with you throughout.
        </p>
      </div>

      <p className="sr-only" aria-live="polite">
        Phase {active + 1} of {PHASES.length}: {PHASES[active]?.title}
      </p>

      {/* Phones and tablets: a plain, readable sequence. The pinned columns need the width. */}
      <div className="mx-auto mt-10 flex max-w-[720px] flex-col gap-10 px-6 lg:hidden">
        <AssistChat />
        {PHASES.map((phase) => (
          <PhaseSection key={phase.id} phase={phase} />
        ))}
      </div>

      {/* Desktop: the scrollytelling stack. Full width is allowed for this section only. */}
      <div
        ref={scrollRef}
        className="relative hidden lg:block"
        style={{ height: `${PHASES.length * 90}vh` }}
      >
        <div className="sticky top-20 overflow-hidden pb-2">
          <div className="mx-auto grid max-w-[1680px] grid-cols-[minmax(210px,270px)_minmax(0,1fr)_minmax(250px,310px)] items-start gap-5 px-6 pt-10 xl:gap-8 xl:px-10">
            <div className="relative h-[300px] self-center">
              {PHASES.map((phase, index) => (
                <motion.div
                  key={phase.id}
                  className="absolute inset-x-0 top-0"
                  style={{ zIndex: index + 1 }}
                  initial={false}
                  animate={{
                    y: index <= active ? index * 20 : 40,
                    opacity: index <= active ? 1 : 0,
                    scale: index <= active ? 1 - (active - index) * 0.015 : 0.98,
                  }}
                  transition={{ type: "spring", stiffness: 260, damping: 30 }}
                  aria-hidden={index !== active}
                  inert={index !== active}
                >
                  <TitleCard phase={phase} active={index === active} />
                </motion.div>
              ))}
            </div>

            <div className="relative h-[min(70vh,650px)] min-w-0">
              {PHASES.map((phase, index) => (
                <motion.div
                  key={phase.id}
                  className={`absolute inset-0 ${index === active ? "pointer-events-auto" : "pointer-events-none"}`}
                  style={{ zIndex: index + 10 }}
                  initial={false}
                  animate={{
                    y: index === active ? 0 : index < active ? -44 : 56,
                    opacity: index === active ? 1 : 0,
                    scale: index === active ? 1 : 0.985,
                  }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  aria-hidden={index !== active}
                  inert={index !== active}
                >
                  <DemoWindow title={phase.windowTitle} className="h-full">
                    <phase.Demo />
                  </DemoWindow>
                </motion.div>
              ))}
            </div>

            <div className="h-[min(70vh,650px)]">
              <AssistChat />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
