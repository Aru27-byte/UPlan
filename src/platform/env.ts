import { z } from "zod";

// Every process validates its own environment at startup and exits if anything is missing —
// "Configuration fails fast" (.claude/rules/best-practices.md). No field here has a default that
// stands in for a real value; a missing required variable is a startup crash, not a guess.
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),

  DATABASE_URL: z.url(),

  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  CITY_OIDC_ISSUER: z.url(),
  CITY_OIDC_DOMAIN: z.string().min(1),
  CITY_OIDC_CLIENT_ID: z.string().min(1),
  CITY_OIDC_CLIENT_SECRET: z.string().min(1),
  GITHUB_CLIENT_ID: z.string().min(1),
  GITHUB_CLIENT_SECRET: z.string().min(1),

  OCI_S3_ENDPOINT: z.url(),
  OCI_S3_REGION: z.string().min(1),
  OCI_S3_ACCESS_KEY_ID: z.string().min(1),
  OCI_S3_SECRET_ACCESS_KEY: z.string().min(1),
  OCI_BUCKET_OBJECTS: z.string().min(1),
  OCI_BUCKET_REPORTS: z.string().min(1),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof EnvSchema>;

// Parsed once, at import time, so a missing variable crashes the process immediately rather than
// surfacing as a confusing failure deep inside a request or job.
export const env: Env = EnvSchema.parse(process.env);
