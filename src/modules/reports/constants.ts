// Split out of render.ts (which imports `react-dom/server`) so that request.ts — reached from a Next.js
// page through this module's index.ts — never statically pulls react-dom/server into a Server
// Component's or Route Handler's build graph. Next.js 16 refuses that outright: "You're importing a
// component that imports react-dom/server."
//
// 1: impacts and evidence. 2 (2026-09-27): screening, study flags, source register, resolutions, the
// cover with its version, what changed, and the review record (locked-report.md R14–R16). A published
// document keeps the template version it was rendered with.
export const CURRENT_TEMPLATE_VERSION = 2;
