// A label and an integer in a small tile, for a panel header (project-dashboard.md R7). Counts only: nothing
// here is a score, a rating, or a percentage, and the type takes a number so a caller can't pass one.
export function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-canvas px-4 py-1.5 text-center">
      <dt className="eyebrow text-muted">{label}</dt>
      <dd className="font-display text-2xl leading-tight font-extrabold text-heading tabular-nums">{value}</dd>
    </div>
  );
}
