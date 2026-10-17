// Every button in UPlan, public and signed in, as class strings, so a Server Component can style a <Link> or a
// plain <button> as a button without importing a client-only library. The design's pills: a green fill with ink
// text for the primary action, a translucent cream outline for the secondary one. Every pairing of text and fill
// here is checked by src/ui/tokens.test.ts.
export type ActionVariant = "primary" | "secondary" | "danger" | "ghost";
export type ActionSize = "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full border font-semibold no-underline disabled:cursor-not-allowed disabled:opacity-60";

const SIZE: Record<ActionSize, string> = {
  md: "min-h-10 px-4.5 py-2 text-sm",
  lg: "min-h-12 px-6.5 py-3 text-base",
};

const VARIANT: Record<ActionVariant, string> = {
  primary: "border-transparent bg-accent-green font-bold text-ink hover:bg-accent-lime",
  secondary: "border-cream/20 bg-cream/[0.06] text-text hover:border-cream/35 hover:bg-cream/[0.12]",
  danger: "border-danger/45 bg-transparent text-danger hover:bg-danger-soft",
  ghost: "border-transparent bg-transparent text-brand hover:bg-cream/[0.07]",
};

export function actionClassName(variant: ActionVariant = "primary", className = "", size: ActionSize = "md"): string {
  return `${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`.trim();
}

/** Shared by every text input, select, and textarea in UPlan. */
export const inputClassName =
  "w-full rounded-xl border border-line-strong bg-page px-3.5 py-2.5 text-sm text-text placeholder:text-faint hover:border-accent-gold/45 focus:border-accent-green disabled:bg-canvas disabled:text-muted aria-[invalid=true]:border-danger data-[invalid]:border-danger";
