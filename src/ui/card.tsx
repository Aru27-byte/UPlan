import type { ReactNode } from "react";

// UIDesign/*.png — the "sticker" card: thick ink border, flat offset shadow, one of four fills
// (or a plain white/cream surface for neutral content like the sign-in card or a table row).
export type CardColor = "yellow" | "green" | "blue" | "tan" | "neutral";

const COLOR_CLASSES: Record<CardColor, string> = {
  yellow: "bg-card-yellow",
  green: "bg-card-green",
  blue: "bg-card-blue",
  tan: "bg-card-tan",
  neutral: "bg-white",
};

export function Card({
  color = "neutral",
  className = "",
  children,
}: {
  color?: CardColor;
  className?: string;
  children: ReactNode;
}) {
  return <div className={`card-sticker p-6 ${COLOR_CLASSES[color]} ${className}`}>{children}</div>;
}
