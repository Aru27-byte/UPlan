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
          testTimeout: 60_000, // container startup
          hookTimeout: 60_000,
          // A test's own beforeAll overwrites DATABASE_URL with the started container's
          // connection string before any query runs; every other var still needs a placeholder
          // here, since module import (and env.ts's validation) happens before that beforeAll.
          setupFiles: ["./tests/setup/dummy-env.ts"],
        },
      },
    ],
  },
});
