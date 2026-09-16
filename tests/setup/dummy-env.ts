// Every module file's import chain eventually reaches src/platform/env.ts, which validates real
// configuration at import time and exits if anything is missing ("Configuration fails fast").
// Two cases need these placeholders before that validation ever runs:
//  - unit tests import a module file for one pure function (schemas, rulesInForce, the
//    impact-condition evaluator, formatters) and never touch the database or network at all;
//  - integration tests only know the real DATABASE_URL after Testcontainers starts a container in
//    their own beforeAll, which is later than module import time, so every OTHER var still needs a
//    placeholder here (the integration test's DATABASE_URL placeholder below is overwritten by
//    each test file's beforeAll before any query runs).
// NODE_ENV is already "test" by the time Vitest runs a project (Vite sets it before any test file
// loads) and @types/node marks it read-only, so it's never (re-)assigned here.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-at-least-32-bytes-long!!";
process.env.BETTER_AUTH_URL ??= "http://localhost:3000";
process.env.CITY_OIDC_ISSUER ??= "https://example.test";
process.env.CITY_OIDC_DOMAIN ??= "example.test";
process.env.CITY_OIDC_CLIENT_ID ??= "test-client-id";
process.env.CITY_OIDC_CLIENT_SECRET ??= "test-client-secret";
process.env.GITHUB_CLIENT_ID ??= "test-client-id";
process.env.GITHUB_CLIENT_SECRET ??= "test-client-secret";
process.env.OCI_S3_ENDPOINT ??= "https://example.test";
process.env.OCI_S3_REGION ??= "us-phoenix-1";
process.env.OCI_S3_ACCESS_KEY_ID ??= "test-access-key";
process.env.OCI_S3_SECRET_ACCESS_KEY ??= "test-secret-key";
process.env.OCI_BUCKET_OBJECTS ??= "test-objects";
process.env.OCI_BUCKET_REPORTS ??= "test-reports";
