import { expect } from "vitest";

// Drizzle wraps a failed query in its own error ("Failed query: …") and keeps the driver's error, which
// carries the database's message (a trigger's RAISE EXCEPTION text, a constraint name), as `cause`. This
// asserts on the whole chain, so a test can say "the database refused it, and this is why".
export async function expectDbError(operation: Promise<unknown>, pattern: RegExp): Promise<void> {
  const failure = await operation.then(
    () => null,
    (error: unknown) => error,
  );
  expect(failure, "expected the database to refuse this operation").not.toBeNull();

  const messages: string[] = [];
  let current: unknown = failure;
  while (current instanceof Error) {
    messages.push(current.message);
    current = current.cause;
  }
  expect(messages.join(" | ")).toMatch(pattern);
}
