import type { Metadata } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";

import "./globals.css";

// The design's four families, served from this deployment rather than a font service (tech-stack.md: no
// runtime call to a third party). Latin subsets; licenses in ./fonts/LICENSES.txt. globals.css maps each
// variable to a Tailwind font utility: font-sans, font-display, font-mono, and font-brand.
const publicSans = localFont({
  src: "./fonts/public-sans.woff2",
  weight: "400 700",
  variable: "--font-public-sans",
  display: "swap",
});
const bricolage = localFont({
  src: "./fonts/bricolage-grotesque.woff2",
  weight: "400 800",
  variable: "--font-bricolage",
  display: "swap",
});
const spaceMono = localFont({
  src: [
    { path: "./fonts/space-mono-regular.woff2", weight: "400" },
    { path: "./fonts/space-mono-bold.woff2", weight: "700" },
  ],
  variable: "--font-space-mono",
  display: "swap",
});
const chewy = localFont({
  src: "./fonts/chewy.woff2",
  weight: "400",
  variable: "--font-chewy",
  display: "swap",
});

export const metadata: Metadata = {
  title: "UPlan",
  description: "Evidence and impact analysis for municipal planning decisions.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${publicSans.variable} ${bricolage.variable} ${spaceMono.variable} ${chewy.variable}`}>
      <body>{children}</body>
    </html>
  );
}
