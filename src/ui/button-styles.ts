// Split out of button.tsx on purpose: this file imports nothing from react-aria-components (or
// any client-only library), so a Server Component can style a plain <a>/<Link>/<button> as a
// button (buttonClassName) without pulling in RAC's Button — which uses React context providers
// internally and therefore fails outside a Client Component ("createContext only works in Client
// Components"). Import this file, not button.tsx, from any Server Component.
export type ButtonVariant = "primary" | "secondary" | "outline";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "card-sticker bg-accent-gold px-5 py-2.5 font-semibold data-[pressed]:translate-x-0.5 data-[pressed]:translate-y-0.5 data-[pressed]:shadow-none",
  secondary:
    "card-sticker bg-accent-green px-5 py-2.5 font-semibold data-[pressed]:translate-x-0.5 data-[pressed]:translate-y-0.5 data-[pressed]:shadow-none",
  outline:
    "card-sticker bg-white px-5 py-2.5 font-semibold data-[pressed]:translate-x-0.5 data-[pressed]:translate-y-0.5 data-[pressed]:shadow-none",
};

/**
 * The same visual treatment as `<Button>` (button.tsx), as a plain class string — for a
 * `next/link` `<Link>` that needs to *look* like a button. A RAC `Button` always renders a
 * `<button>`, so nesting a `<Link>` inside one is invalid HTML and breaks navigation; a styled
 * `<Link>` is the correct "link that looks like a button" pattern instead.
 */
export function buttonClassName(variant: ButtonVariant = "primary", className = ""): string {
  return `${VARIANT_CLASSES[variant]} ${className}`;
}
