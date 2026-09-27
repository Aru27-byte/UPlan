// A label and an integer (project-dashboard.md R7). Counts only: nothing here is a score, a rating, or a
// percentage, and the type takes a number so a caller can't pass one.
export function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-5 py-4 shadow-panel">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-text">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
