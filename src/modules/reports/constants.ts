// Split out of render.ts (which imports `react-dom/server`) so that `releaseReport` — reached
// from a Next.js page through this module's index.ts — never statically pulls react-dom/server
// into a Server Component's or Route Handler's build graph. Next.js 16 refuses that outright:
// "You're importing a component that imports react-dom/server." render.ts itself is now only ever
// reached via a dynamic `import()`, from release.ts's `renderAndStoreReport` (a worker job body)
// and from the report-preview route handler — see both for the same comment.
export const CURRENT_TEMPLATE_VERSION = 1;
