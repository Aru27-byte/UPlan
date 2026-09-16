import { NextResponse } from "next/server";

import { mvtTile } from "@/modules/evidence";

// TechDesign/evidence-layers.md, R9: the URL names the dataset version, so the response never
// changes — next.config.ts sets this route's long, immutable Cache-Control header.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ datasetVersionId: string; z: string; x: string; y: string }> },
) {
  const { datasetVersionId, z, x, y } = await params;
  const tile = await mvtTile(datasetVersionId, Number(z), Number(x), Number(y));
  // NextResponse's BodyInit (lib.dom) doesn't structurally recognize Node's Buffer subclass —
  // a plain Uint8Array view of the same bytes satisfies it without copying semantics changing.
  return new NextResponse(new Uint8Array(tile), {
    headers: { "Content-Type": "application/vnd.mapbox-vector-tile" },
  });
}
