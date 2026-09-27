// The signed-in app's buttons, as class strings, so a Server Component can style a <Link> or a plain
// <button> as a button without importing a client-only library — the same split button-styles.ts makes for
// the public pages, whose sticker look stays there (TechDesign/project-dashboard.md). Every pairing of text
// and fill here is checked by src/ui/tokens.test.ts.
export type ActionVariant = "primary" | "secondary" | "danger" | "ghost";

const BASE =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold no-underline disabled:cursor-not-allowed disabled:opacity-60";

const VARIANT: Record<ActionVariant, string> = {
  primary: "bg-brand text-white hover:bg-brand-strong",
  secondary: "border border-line bg-surface text-text hover:bg-canvas",
  danger: "border border-danger bg-surface text-danger hover:bg-danger-soft",
  ghost: "text-brand hover:bg-brand-soft",
};

export function actionClassName(variant: ActionVariant = "primary", className = ""): string {
  return `${BASE} ${VARIANT[variant]} ${className}`.trim();
}

/** Shared by every text input, select, and textarea in the app. */
export const inputClassName =
  "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-text placeholder:text-muted disabled:bg-canvas disabled:text-muted";
