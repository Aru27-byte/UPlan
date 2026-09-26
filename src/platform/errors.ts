// Expected outcomes throw one of these four, with a message a planner or operator can act on.
// Everything else propagates and is treated as a defect (.claude/rules/conventions.md, "Errors").

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(subject: string) {
    super(`${subject} not found`);
    this.name = "NotFoundError";
  }
}

export function isUniqueViolation(err: unknown): boolean {
  // node-postgres surfaces PostgreSQL's SQLSTATE on the error object; 23505 is unique_violation.
  // Drizzle wraps a failed query in its own error and keeps the driver's error as `cause`.
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && err.code === "23505") return true;
  return "cause" in err && isUniqueViolation(err.cause);
}
