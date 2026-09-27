export { requestFinalDocument } from "./request";
export {
  listDocumentVersions,
  getLatestAttempt,
  getDocumentFile,
  getLatestReleasedSnapshot,
} from "./versions";
export type { DocumentVersion, DocumentAttempt } from "./versions";
export { ReportSnapshotSchema, PHASE_KEYS } from "./snapshot";
export type { ReportSnapshot, ReportDetails, ReportPhase, PhaseKey } from "./snapshot";
export { CURRENT_TEMPLATE_VERSION } from "./constants";

// `renderAndStoreReport` and `markReportFailed` (render-and-store.ts), and `renderReportHtml`/
// `ReportDocument` (render.ts/document.tsx), are deliberately NOT re-exported here. They pull in
// `react-dom/server`, which Next.js 16 refuses to let be reachable — statically or via a dynamic
// `import()` — from anything the app router's build graph can reach (a Server Component or a Route
// Handler). This module's only Next.js-side consumers need just the names above. The worker
// (src/worker/tasks.ts) — a separate esbuild bundle Next never traces into — reaches them with a deep
// import instead of through this barrel; that one deep import has a matching ESLint exception
// (eslint.config.js).
