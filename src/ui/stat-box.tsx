// A label and an integer in a small sticker box, for a panel header (project-dashboard.md R7). Counts only:
// nothing here is a score, a rating, or a percentage, and the type takes a number so a caller can't pass one.
export function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border-2 border-ink bg-white px-4 py-1.5 text-center shadow-button">
      <dt className="eyebrow text-muted">{label}</dt>
      <dd className="text-2xl leading-tight font-bold text-text tabular-nums">{value}</dd>
    </div>
  );
}
