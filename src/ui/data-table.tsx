import type { ReactNode } from "react";

// A table with real header cells and a caption, for the registers and lists of a phase page (WCAG 2.1 AA:
// header cells on every table, and the map's content is available as text). The first cell of each row is
// its row header. Server-safe: it takes nodes, so a page decides what each cell says.
export function DataTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: { key: string; cells: ReactNode[] }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => (
              <th key={column} scope="col" className="px-3 py-2 text-xs font-semibold tracking-wide text-muted uppercase first:pl-0 last:pr-0">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line align-top last:border-b-0">
              {row.cells.map((cell, index) =>
                index === 0 ? (
                  <th key={index} scope="row" className="py-3 pr-3 font-medium text-text">
                    {cell}
                  </th>
                ) : (
                  <td key={index} className="px-3 py-3 text-text last:pr-0">
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
