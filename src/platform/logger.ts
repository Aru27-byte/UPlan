import pino from "pino";

import { env } from "./env";

// The one logger. Nothing else in the codebase calls console.* (eslint.config.js bans it) — pino
// writes structured JSON to stdout, which Docker's local log driver keeps and rotates on the VM
// (TechDesign/system-architecture.md, "Logs"). Never logs secrets or personal data beyond a user id
// (.claude/rules/best-practices.md).
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.secret"],
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
