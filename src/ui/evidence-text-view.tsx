import type { EvidenceLayer } from "./map-workspace.client";

// TechDesign/map-workspace.md, R4: everything the map shows is also available as text. A plain
// server-rendered table — no client JavaScript — so it's readable without the map ever loading.
export function EvidenceTextView({ layers }: { layers: EvidenceLayer[] }) {
  return (
    <section aria-label="Evidence layers, as text">
      <h2>Evidence layers</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Layer</th>
            <th scope="col">Map status</th>
            <th scope="col">Source</th>
            <th scope="col">Retrieved</th>
            <th scope="col">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {layers.map((l) => (
            <tr key={l.datasetVersionId} id={`layer-${l.datasetVersionId}`}>
              <th scope="row">{l.label}</th>
              <td>{l.mapStatus}</td>
              <td>{l.provenance.sourceLine}</td>
              <td>{l.provenance.retrievedLine}</td>
              <td>
                {l.provenance.confidenceLine ??
                  "Not applicable — this figure comes from adopted rules, not measured data."}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
