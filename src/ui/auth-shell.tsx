import Link from "next/link";
import type { ReactNode } from "react";

// TechDesign/accounts-roles.md — R12. The one layout the sign-in and register pages share: the whole
// viewport, a card centered in it, and a slowly moving background in the app's palette. The motion is
// CSS only (globals.css, `.auth-*`) and stops under prefers-reduced-motion.

const RING_COUNT = 13;
const POINT_COUNT = 40;

// A closed, smooth blob: a circle whose radius wobbles by a few fixed sine terms. `seed` shifts the
// wobble so neighboring rings drift apart the way real contour lines do. No randomness, so the
// server render is the same every time. Written with a function `point(i)` rather than an array so
// there is no indexing that could come back undefined.
function contourPath(centerX: number, centerY: number, radius: number, seed: number): string {
  const point = (i: number): [number, number] => {
    const angle = ((i % POINT_COUNT) / POINT_COUNT) * Math.PI * 2;
    const wobble =
      1 + 0.16 * Math.sin(3 * angle + seed) + 0.09 * Math.sin(5 * angle + seed * 2.3) + 0.05 * Math.sin(8 * angle + seed * 0.7);
    return [centerX + radius * wobble * Math.cos(angle), centerY + radius * wobble * Math.sin(angle)];
  };
  const midpoint = (i: number): string => {
    const [ax, ay] = point(i);
    const [bx, by] = point(i + 1);
    return `${((ax + bx) / 2).toFixed(1)} ${((ay + by) / 2).toFixed(1)}`;
  };
  // Quadratic curves between edge midpoints, with each vertex as the control point: smooth and short.
  let path = `M${midpoint(0)}`;
  for (let i = 1; i <= POINT_COUNT; i++) {
    const [x, y] = point(i);
    path += `Q${x.toFixed(1)} ${y.toFixed(1)} ${midpoint(i)}`;
  }
  return `${path}Z`;
}

function Contours({ centerX, centerY, className, seed }: { centerX: number; centerY: number; className: string; seed: number }) {
  return (
    <g className={className}>
      {Array.from({ length: RING_COUNT }, (_, ring) => (
        <path key={ring} d={contourPath(centerX, centerY, 34 + ring * 34, seed + ring * 0.32)} />
      ))}
    </g>
  );
}

const POINTS = ["Every figure shows its source, date, and confidence.", "Evidence for a decision, not an opinion on it.", "UPlan lays out the tradeoff. It never makes the call."];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="bg-ink text-cream relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="auth-glow auth-glow-green" />
        <div className="auth-glow auth-glow-gold" />
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 1200 800"
          preserveAspectRatio="xMidYMid slice"
          fill="none"
          stroke="var(--color-cream)"
          strokeOpacity={0.09}
          strokeWidth={1.25}
        >
          <Contours centerX={260} centerY={230} className="auth-contour-a" seed={0.4} />
          <Contours centerX={960} centerY={600} className="auth-contour-b" seed={2.1} />
        </svg>
      </div>

      <div className="grid w-full max-w-6xl overflow-hidden rounded-xl border-2 border-cream/70 bg-white text-ink shadow-[10px_10px_0_0_rgb(139_195_74/0.4)] lg:min-h-[42rem] lg:grid-cols-[5fr_6fr]">
        <aside className="bg-sidebar text-cream hidden flex-col justify-between gap-12 p-10 lg:flex">
          <div>
            <Link href="/" className="flex items-center gap-2 outline-2 outline-transparent focus-visible:underline">
              <span aria-hidden className="text-2xl">
                🌰
              </span>
              <span className="font-serif text-2xl font-bold">UPlan</span>
            </Link>
            <p className="eyebrow mt-8 inline-block rounded-full border border-white/30 px-4 py-1">Pilot · Sammamish, WA</p>
            <p className="mt-6 text-4xl leading-tight font-bold">
              Develop <span className="text-accent-green">or</span>
              <br />
              preserve.
            </p>
            <p className="text-cream/85 mt-4 max-w-sm">
              The evidence behind decisions to develop forests and other habitat, laid out clearly enough to
              withstand scrutiny.
            </p>
          </div>
          <ul className="flex flex-col gap-3">
            {POINTS.map((point) => (
              <li key={point} className="text-cream/90 flex items-start gap-3 text-sm">
                <span aria-hidden className="bg-accent-green mt-1.5 size-2 shrink-0 rounded-full" />
                {point}
              </li>
            ))}
          </ul>
        </aside>

        <div className="flex flex-col justify-center p-6 sm:p-12 lg:px-20 lg:py-14">
          <Link href="/" className="mb-8 flex items-center gap-2 lg:hidden">
            <span aria-hidden className="text-2xl">
              🌰
            </span>
            <span className="font-serif text-xl font-bold">UPlan</span>
          </Link>
          {children}
        </div>
      </div>

      <footer className="eyebrow text-cream/70 mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-center">
        <span>Piloted with the City of Sammamish, Washington</span>
        <Link href="/" className="hover:text-cream underline underline-offset-4">
          Back to home
        </Link>
      </footer>
    </main>
  );
}
