import Link from "next/link";
import type { ReactNode } from "react";

import { Backdrop } from "./backdrop";
import { Brand } from "./brand";

// TechDesign/accounts-roles.md — R12. The one layout the sign-in and register pages share: the whole
// viewport, a form card centered in it, and the same ambient backdrop as the landing page and the app. The
// card is the design's gradient-edged window.
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative isolate flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
      <Backdrop className="absolute" />

      <div className="frame-glow w-full max-w-xl p-8 sm:p-12">
        <Link href="/" className="mb-8 inline-flex rounded-lg">
          <Brand />
        </Link>
        {children}
      </div>

      <footer className="eyebrow mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-center text-faint">
        <span>Piloted with the City of Sammamish, Washington</span>
        <Link href="/" className="text-accent-gold underline underline-offset-4 hover:text-accent-lime">
          Back to home
        </Link>
      </footer>
    </main>
  );
}
