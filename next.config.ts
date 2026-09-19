import type { NextConfig } from "next";

// Data caching stays off everywhere: rules, evidence, decisions, and reports must never be served
// stale (.claude/rules/do-not.md — no `use cache`, cacheComponents, unstable_cache, or revalidate).
const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb", // matches the 5 MB profile-upload limit (system-architecture.md, Uploads)
    },
  },
  headers() {
    // The one deliberately cached response: a tile URL names its dataset version, so the *data*
    // it renders never changes (TechDesign/evidence-layers.md) — but the query that renders it is
    // application code, which does change while it's being developed. A year-long immutable cache
    // in production is exactly right (a released dataset version is permanently fixed); the same
    // header in development means a tile URL a browser fetched while `mvtTile`'s query still had a
    // bug stays wrong for a year after the bug is fixed, since the URL itself never changes to bust
    // the cache — exactly what made evidence layers look "zoom-dependent" after fixing the SRID
    // mismatch in tiles.ts (some z/x/y a browser had already visited kept serving the pre-fix empty
    // tile from cache; unvisited ones picked up the fix immediately). Never cache in development.
    const cacheControl =
      process.env.NODE_ENV === "production" ? "public, max-age=31536000, immutable" : "no-store";
    return [
      {
        source: "/api/tiles/:path*",
        headers: [{ key: "Cache-Control", value: cacheControl }],
      },
    ];
  },
};

export default nextConfig;
