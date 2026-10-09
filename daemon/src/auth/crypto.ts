import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Bearer tokens are prefixed so they are recognisable in support/debugging. */
const TOKEN_PREFIX = 'pc_';

/** Generate a new device bearer token (256 bits of entropy, url-safe). Shown once. */
export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString('base64url');
}

/** Generate a one-time pairing code (160 bits, url-safe). Embedded in the QR. */
export function generatePairingCode(): string {
  return randomBytes(20).toString('base64url');
}

/** SHA-256 hex digest. We persist hashes of secrets, never the secrets themselves. */
export function sha256hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Constant-time comparison of two hex digests (CLAUDE.md: compare in constant time).
 * Returns false for any length mismatch without leaking timing on the contents.
 */
export function constantTimeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return timingSafeEqual(bufA, bufB);
}
