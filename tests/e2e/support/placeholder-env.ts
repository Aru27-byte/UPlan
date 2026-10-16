// Import this FIRST in a spec that loads UPlan's modules from Node. Every module's import chain reaches
// src/platform/env.ts, which validates the whole environment at import time. A spec that only reads text and calls
// the model service touches no database or storage, so what it does not have gets the same placeholders the unit
// tests use (tests/setup/dummy-env.ts). A real value from .env or the shell is never replaced. The model key is not
// given a placeholder: without NVIDIA_API_KEY the live specs fail by name instead of calling anything.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.APP_URL ??= "http://localhost:3000";
process.env.SUPABASE_URL ??= "https://example.test";
process.env.SUPABASE_PUBLISHABLE_KEY ??= "test-publishable-key";
process.env.OCI_S3_ENDPOINT ??= "https://example.test";
process.env.OCI_S3_REGION ??= "us-phoenix-1";
process.env.OCI_S3_ACCESS_KEY_ID ??= "test-access-key";
process.env.OCI_S3_SECRET_ACCESS_KEY ??= "test-secret-key";
process.env.OCI_BUCKET_OBJECTS ??= "test-objects";
process.env.OCI_BUCKET_REPORTS ??= "test-reports";
