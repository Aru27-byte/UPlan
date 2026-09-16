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
    // The one deliberately cached response: a tile URL names its dataset version, so it
    // never changes (TechDesign/evidence-layers.md).
    return [
      {
        source: "/api/tiles/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
