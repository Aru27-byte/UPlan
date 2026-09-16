import { Card, type CardColor } from "./card";

// UIDesign/Dashboard.png, Footprint.png — a label + big number tile.
export function StatTile({
  label,
  value,
  color = "neutral",
}: {
  label: string;
  value: string | number;
  color?: CardColor;
}) {
  return (
    <Card color={color}>
      <p className="eyebrow">{label}</p>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </Card>
  );
}
