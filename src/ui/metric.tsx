// A label and an integer (project-dashboard.md R7). Counts only: nothing here is a score, a rating, or a
// percentage, and the type takes a number so a caller can't pass one.
export function Metric({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border-2 border-cream/70 bg-surface text-text shadow-panel px-5 py-4">
      <p className="eyebrow text-muted">{label}</p>
      <p className="mt-1 text-4xl font-bold text-text">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
