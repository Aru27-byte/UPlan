// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import importX from "eslint-plugin-import-x";

// Module boundaries and no-fallback discipline are enforced here, not just by convention:
// see .claude/rules/file-structure-and-imports.md and .claude/rules/conventions.md.
export default tseslint.config(
  {
    ignores: [".next/**", "dist/**", "node_modules/**", "deploy/**", "coverage/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Plain JS config files at the repo root aren't part of tsconfig.json's `include`
          // (**/*.ts, **/*.tsx) — lint them against a default project instead of erroring.
          allowDefaultProject: ["eslint.config.js", "postcss.config.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "import-x": importX },
    settings: {
      // Resolves the `@/*` path alias and package "exports" subpaths (e.g. "write-excel-file/node")
      // the same way tsconfig.json does, so import-x/no-cycle can actually follow the graph.
      "import-x/resolver": {
        typescript: { alwaysTryTypes: true, project: "./tsconfig.json" },
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      // conventions.md: "Use `type`, not `interface`" — overrides stylisticTypeChecked's default.
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-restricted-syntax": [
        "error",
        {
          // accounts-roles.md R9: staff rights and jurisdiction membership are never combined.
          selector:
            "LogicalExpression[operator='||'] CallExpression[callee.name=/^(requireStaff|requireMembership|requirePlanner|requireReviewer)$/]",
          message:
            "Don't OR an accounts access check with another — staff and membership checks must never combine (accounts-roles.md R9).",
        },
        {
          // platform/db.ts constructs `db` without a schema (platform must never import module
          // tables, per file-structure-and-imports.md), so Drizzle's relational `db.query` API
          // isn't available — use the query builder (`db.select().from(...)`) everywhere instead.
          selector: "MemberExpression[object.name=/^(db|tx)$/][property.name='query']",
          message:
            "`db`/`tx` has no schema, so `.query.*` isn't available — use `db.select().from(table).where(...)` instead.",
        },
      ],
      "import-x/no-cycle": "error",
      // A deep import reaches past a module's public API (file-structure-and-imports.md).
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/*"],
              message: "Import only a module's index.ts — its public API — from outside the module.",
            },
          ],
        },
      ],
    },
  },
  {
    // src/platform imports nothing from modules, routes, UI, or the worker.
    files: ["src/platform/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules", "@/modules/*", "@/app/*", "@/ui/*", "@/worker/*"],
              allowTypeImports: false,
            },
          ],
        },
      ],
    },
  },
  {
    // Client components and src/ui never import runtime code from @/modules or @/platform.
    files: ["**/*.client.tsx", "src/ui/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules", "@/modules/*", "@/platform", "@/platform/*"],
              message:
                "Client components and src/ui must not import runtime code from @/modules or @/platform (file-structure-and-imports.md). `import type` is fine.",
              allowTypeImports: true,
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // The one sanctioned deep import in the whole codebase: `renderAndStoreReport` is deliberately
    // excluded from reports/index.ts because it pulls in `react-dom/server`, which Next.js 16
    // refuses anywhere in the app router's build graph (see reports/index.ts's and render-and-
    // store.ts's comments). The worker is a separate esbuild bundle Next never traces into, so this
    // one path is safe here specifically — every other deep import still fails lint, in this file
    // and everywhere else.
    files: ["src/worker/tasks.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modules/*/*", "!@/modules/reports/render-and-store"],
              message: "Import only a module's index.ts — its public API — from outside the module.",
            },
          ],
        },
      ],
    },
  },
  {
    // Plain tooling config, linted only via the default-project fallback above (no real domain
    // logic) — type-aware rules produce noise here (e.g. `import.meta.dirname` typed loosely
    // under the default project) rather than catching anything meaningful.
    files: ["eslint.config.js", "postcss.config.mjs"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "off",
    },
  },
);
