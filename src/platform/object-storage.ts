import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

import { env } from "./env";

// The one object storage client, pointed at OCI's S3-compatibility endpoint (TechDesign/tech-stack.md,
// D17). Every write is idempotent by construction: keys are content hashes or record ids, and the
// application's IAM credentials can create and read objects but never overwrite or delete them
// (TechDesign/data-model.md, "Object storage") — so this wrapper never exposes a delete or overwrite
// call at all, not even for tests to misuse.
const client = new S3Client({
  endpoint: env.OCI_S3_ENDPOINT,
  region: env.OCI_S3_REGION,
  credentials: { accessKeyId: env.OCI_S3_ACCESS_KEY_ID, secretAccessKey: env.OCI_S3_SECRET_ACCESS_KEY },
  requestChecksumCalculation: "WHEN_REQUIRED", // matches OCI's current-AWS-SDK tutorial (data-model.md)
});

export type Bucket = "objects" | "reports";

function bucketName(bucket: Bucket): string {
  return bucket === "objects" ? env.OCI_BUCKET_OBJECTS : env.OCI_BUCKET_REPORTS;
}

/** Writes only if the key doesn't already exist; treats an existing object with the same content as already written. */
export async function putIfAbsent(
  bucket: Bucket,
  key: string,
  body: Buffer,
  opts?: { contentType?: string; metadata?: Record<string, string> },
): Promise<void> {
  const existing = await headIfExists(bucket, key);
  if (existing) return; // create-only credentials would reject a second write anyway; this avoids the round trip
  await client.send(
    new PutObjectCommand({
      Bucket: bucketName(bucket),
      Key: key,
      Body: body,
      ContentType: opts?.contentType,
      Metadata: opts?.metadata,
    }),
  );
}

export async function headIfExists(
  bucket: Bucket,
  key: string,
): Promise<{ metadata: Record<string, string> } | null> {
  try {
    const res = await client.send(new HeadObjectCommand({ Bucket: bucketName(bucket), Key: key }));
    return { metadata: res.Metadata ?? {} };
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err; // anything else is a real failure — no fallback, per .claude/rules/best-practices.md
  }
}

export async function getObject(bucket: Bucket, key: string): Promise<Buffer> {
  const res = await client.send(new GetObjectCommand({ Bucket: bucketName(bucket), Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`object ${bucket}/${key} had no body`);
  return Buffer.from(bytes);
}

function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && "name" in err && err.name === "NotFound";
}
