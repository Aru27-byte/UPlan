import { z } from "zod";

// Every process validates its own environment at startup and exits if anything is missing —
// "Configuration fails fast" (.claude/rules/best-practices.md). No field here has a default that
// stands in for a real value; a missing required variable is a startup crash, not a guess.
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),

  DATABASE_URL: z.url(),

  // Sign-in is Supabase Auth, called only from the server (TechDesign/accounts-roles.md, D14).
  // APP_URL is where the emailed confirmation link sends the person back to.
  APP_URL: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),

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
