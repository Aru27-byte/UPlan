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

// node-postgres surfaces PostgreSQL's SQLSTATE on the error object. Drizzle wraps a failed query in
// its own error and keeps the driver's error as `cause`, so the code is looked for down the chain.
function hasSqlState(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && err.code === code) return true;
  return "cause" in err && hasSqlState(err.cause, code);
}

/** 23505 unique_violation. */
export function isUniqueViolation(err: unknown): boolean {
  return hasSqlState(err, "23505");
}

/** 23503 foreign_key_violation. */
export function isForeignKeyViolation(err: unknown): boolean {
  return hasSqlState(err, "23503");
}
