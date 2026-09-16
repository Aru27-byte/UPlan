export { releaseReport, downloadReport, getLatestReportForDecision } from "./release";
export { CURRENT_TEMPLATE_VERSION } from "./constants";

// `renderAndStoreReport` (render-and-store.ts) and `renderReportHtml`/`ReportDocument`
// (render.ts/document.tsx) are deliberately NOT re-exported here. They pull in
// `react-dom/server`, which Next.js 16 refuses to let be reachable — statically or via a dynamic
// `import()` — from anything the app router's build graph can reach (a Server Component or a
// Route Handler). This module's only Next.js-side consumers (decisions pages) need just the three
// names above. The worker (src/worker/tasks.ts) — a separate esbuild bundle Next never traces
// into — reaches `renderAndStoreReport` with a deep import instead of through this barrel; that
// one deep import has a matching ESLint exception (eslint.config.js).
