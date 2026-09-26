import Link from "next/link";

import { buttonClassName } from "@/ui/button-styles";
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

// UIDesign/Landing.png — the public, signed-out home page. No requireActor() call: this page is
// exempt from src/proxy.ts's sign-in redirect and must render for anyone. Copy here is static
// marketing text, not a live query — there is no signed-in actor to query anything as.
export default function LandingPage() {
  return (
    <main className="bg-ink text-cream min-h-screen px-6 py-10 sm:px-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-2xl">
            🌰
          </span>
          <span className="font-serif text-2xl font-bold">UPlan</span>
        </div>
        <h1 className="min-w-0 flex-1 text-center text-[clamp(2rem,5.5vw,5rem)] font-bold leading-none">
          Develop <span className="text-accent-green">or</span> preserve.
        </h1>
        <span className="eyebrow rounded-full border border-white/30 px-4 py-1">Pilot · Sammamish, WA</span>
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:items-start">
        <div>
          {/* Background-style video: decorative, silent, no controls, and unreachable by pointer or
              keyboard. No video asset exists in the repo yet: add `src` (or a <source>) when one is
              supplied. */}
          <video
            autoPlay
            muted
            loop
            playsInline
            disablePictureInPicture
            disableRemotePlayback
            aria-hidden="true"
            tabIndex={-1}
            className="pointer-events-none aspect-video w-full rounded-2xl bg-black object-cover"
          />
          <Link
            href="/sign-in"
            className={buttonClassName("primary", "mt-6 block w-full py-4 text-center text-xl text-ink")}
          >
            Launch UPlan &rarr;
          </Link>
        </div>

        <div className="card-sticker relative flex aspect-[4/3] items-end justify-start overflow-hidden border-white/40 p-4">
          <LandingMap basemapUrl={BASEMAP_URL} bounds={SAMMAMISH_BOUNDS} />
          <input
            type="search"
            aria-label="Search study area"
            placeholder="sammamish, wa"
            className="card-sticker absolute inset-x-4 top-4 z-10 bg-white px-4 py-2.5 text-ink"
          />
          <span className="badge relative z-10">Study area &middot; Sammamish, WA</span>
        </div>
      </div>

      <div className="card-sticker eyebrow mt-14 flex flex-wrap justify-center gap-x-3 gap-y-1 border-white/30 border-dashed px-4 py-3 text-cream/80">
        <span>6 critical area types</span>
        <span>&middot;</span>
        <span>1 pilot city</span>
        <span>&middot;</span>
        <span className="text-accent-green">100% sourced</span>
        <span>&middot;</span>
        <span>0 verdicts rendered</span>
      </div>

      <section aria-labelledby="showcase-heading" className="mx-auto mt-20 max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow text-accent-green">What&rsquo;s inside</p>
          <h2 id="showcase-heading" className="mt-3 text-4xl leading-tight font-bold sm:text-5xl">
            From scattered evidence to a report that holds up
          </h2>
          <p className="text-cream/80 mt-4 text-lg">
            Six things UPlan does that a pile of public maps can&rsquo;t. Pick one and try it.
          </p>
        </div>
        <div className="mt-12">
          <FeatureShowcase />
        </div>
      </section>

      <section className="mx-auto mt-24 flex max-w-3xl flex-col items-center gap-6 text-center">
        <h2 className="text-3xl leading-tight font-bold">
          Helps you help the <span className="text-accent-green">environment</span>.
        </h2>
        <p className="text-cream/80 text-lg">
          UPlan lays out the evidence and the tradeoff. The decision stays with the people who make it.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <span className="badge">Provenance on every figure</span>
          <span className="badge">Never clears land</span>
          <span className="badge">Never makes the call</span>
        </div>
        <div className="mt-2 flex flex-wrap justify-center gap-4">
          <Link href="/sign-in" className={buttonClassName("primary", "px-8 py-3.5 text-lg text-ink")}>
            Launch UPlan &rarr;
          </Link>
          <Link href="/register" className={buttonClassName("outline", "px-8 py-3.5 text-lg text-ink")}>
            Register
          </Link>
        </div>
      </section>

      <footer className="eyebrow mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-white/20 pt-6 text-cream/70">
        <span>Piloted with the City of Sammamish, Washington</span>
        <Link href="/sign-in" className="hover:text-cream">
          Sign in &rarr;
        </Link>
      </footer>
    </main>
  );
}
