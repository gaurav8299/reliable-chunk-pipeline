/**
 * Checksum Validation — SHA-256 based data integrity checks.
 */

import { createHash } from "node:crypto";

/** Generate a SHA-256 hex checksum for the given data */
export function generateChecksum(data: string): string {
  return createHash("sha256").update(data, "utf-8").digest("hex");
}

/** Verify data matches the expected checksum */
export function verifyChecksum(data: string, expectedChecksum: string): boolean {
  const actual = generateChecksum(data);
  return actual === expectedChecksum;
}
