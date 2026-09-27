import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Two projects, per .claude/rules/testing-and-verification.md: pure-logic unit tests never touch a
// database; anything that runs SQL uses a real PostgreSQL/PostGIS container via Testcontainers.
// `npm test` runs only "unit"; `npm run test:integration` runs only "integration" (slower, needs Docker).
export default defineConfig({
  resolve: {
    // Vitest runs on Vite, which doesn't read tsconfig.json's "paths" on its own — the same `@/*`
    // alias tsconfig.json and next.config.ts resolve has to be declared again here.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    // tsconfig.json sets "jsx": "preserve" for Next's own compiler. Outside Next's build, Vite has
    // no JSX transform of its own, so report/document.tsx and src/ui/*.tsx need this plugin to be
    // parseable under Vitest at all.
    react(),
  ],
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
          exclude: ["src/**/*.integration.test.ts"],
          setupFiles: ["./tests/setup/dummy-env.ts"],
        },
      },
      {
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000, // the container starts and every migration runs in globalSetup
          // The global setup starts one PostGIS container, applies every migration, and sets
          // DATABASE_URL before any worker starts. Every OTHER variable env.ts requires still needs a
          // placeholder, since module import (and env.ts's validation) happens at import time.
          globalSetup: ["./tests/setup/integration-db.ts"],
          setupFiles: ["./tests/setup/dummy-env.ts"],
          // One process at a time: race tests open their own connections, and a single Node process
          // sharing one pool per file keeps the container's connection count predictable.
          fileParallelism: false,
        },
      },
    ],
  },
});
