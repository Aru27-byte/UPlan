// The signed-in app's buttons, as class strings, so a Server Component can style a <Link> or a plain
// <button> as a button without importing a client-only library — the same split button-styles.ts makes for
// the public pages, whose sticker look these share (TechDesign/project-dashboard.md). Every pairing of text
// and fill here is checked by src/ui/tokens.test.ts.
export type ActionVariant = "primary" | "secondary" | "danger" | "ghost";

const BASE =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border-2 border-ink px-4 py-2 text-sm font-semibold no-underline shadow-button active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:cursor-not-allowed disabled:opacity-60";

const VARIANT: Record<ActionVariant, string> = {
  primary: "bg-accent-gold text-ink hover:bg-accent-gold-deep",
  secondary: "bg-white text-ink hover:bg-canvas",
  danger: "bg-white text-danger hover:bg-danger-soft",
  ghost: "border-transparent bg-transparent text-brand shadow-none hover:bg-brand-soft",
};

export function actionClassName(variant: ActionVariant = "primary", className = ""): string {
  return `${BASE} ${VARIANT[variant]} ${className}`.trim();
}

/** Shared by every text input, select, and textarea in the app. */
export const inputClassName =
  "w-full rounded-lg border-2 border-ink bg-white px-3 py-2 text-sm text-text placeholder:text-muted focus:shadow-[3px_3px_0_0_var(--color-ink)] disabled:bg-canvas disabled:text-muted";
