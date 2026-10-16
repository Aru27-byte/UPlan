// What the end-to-end specs read from the environment. A missing credential is an error that names the variable;
// a number with a stated default (a timeout, a latency budget) is a tuning knob, not stand-in data.

export const AUTH_FILE = "tests/e2e/.auth/user.json";

/** Where the app under test is. The config uses the same value, so a worker-scoped browser context agrees with it. */
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export type Credentials = { email: string; password: string };

/** The registered person the signed-in specs sign in as. */
export function credentials(): Credentials {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "The signed-in specs need E2E_EMAIL and E2E_PASSWORD: the email and password of a person registered at /register " +
        "(and run `npm run db:seed:local -- <that email>` once so the city, its profile, and sample evidence exist).",
    );
  }
  return { email, password };
}

function intFromEnv(name: string, whenUnset: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return whenUnset;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0)
    throw new Error(`${name} must be a positive whole number, got "${raw}".`);
  return value;
}

/** Set when the database has more than one city, so the city-switching spec is registered. */
export const MULTIPLE_CITIES = process.env.E2E_MULTIPLE_CITIES === "1";

/** How long a project may take to go from a saved input to a finished analysis. Needs `npm run worker:dev`. */
export const ANALYSIS_TIMEOUT_MS = intFromEnv("E2E_ANALYSIS_TIMEOUT_MS", 3 * 60_000);

/** How long the final document may take to generate after "Finish research". */
export const DOCUMENT_TIMEOUT_MS = intFromEnv("E2E_DOCUMENT_TIMEOUT_MS", 2 * 60_000);

// AI latency budgets. The model client gives a call 45 s (CALL_TIMEOUT_MS) before it records a timeout, so no
// answer may take longer than that, and a budget at or above it would never fail. The median and the 95th
// percentile are what a planner waiting on the Ask button actually feels. Tune them from a measured baseline
// in the report this suite prints; a change that makes them worse is what the suite is there to catch.
export const AI_LATENCY_P50_MS = intFromEnv("E2E_AI_LATENCY_P50_MS", 15_000);
export const AI_LATENCY_P95_MS = intFromEnv("E2E_AI_LATENCY_P95_MS", 35_000);
export const AI_LATENCY_HARD_MAX_MS = 45_000;

// Performance budgets (the perf specs, tagged @perf). The numbers below are for a production build on Vercel with
// Supabase in the same region: they are what a planner should feel. A development server, a laptop, or a far-away
// database is slower for reasons that are not the app's, so E2E_PERF_SCALE multiplies every time budget (and nothing
// else): 1 for production, 10 to check a dev server's mechanics. Byte, count, and shift budgets never scale.
function floatFromEnv(name: string, whenUnset: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return whenUnset;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${name} must be a positive number, got "${raw}".`);
  return value;
}
export const PERF_SCALE = floatFromEnv("E2E_PERF_SCALE", 1);
/** A time budget in milliseconds, scaled for the machine under test. */
export const ms = (budget: number): number => budget * PERF_SCALE;
/** How many times each page or action is measured after one warm-up. The 95th percentile of fewer than 20 is the worst. */
export const PERF_RUNS = intFromEnv("E2E_PERF_RUNS", 5);
/** How many projects the scaling spec builds up to. */
export const PERF_PROJECTS = intFromEnv("E2E_PERF_PROJECTS", 10);

/** How many times each golden case is asked. The model samples at temperature 1.0, so one answer proves little. */
export const AI_REPEATS = intFromEnv("E2E_AI_REPEATS", 3);

/** Embeddings are a smaller, faster call: the budget a retrieval step can spend before the planner notices. */
export const AI_EMBED_LATENCY_P95_MS = intFromEnv("E2E_AI_EMBED_LATENCY_P95_MS", 5_000);

/** The share of live model answers that must pass every check (K1-K8) and contain the expected quote. */
export const AI_MIN_PASS_RATE = 0.85;
