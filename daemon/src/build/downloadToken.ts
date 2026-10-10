import { createHmac } from 'node:crypto';
import { constantTimeEqualHex } from '../auth/crypto.js';

/**
 * Signed, time-limited download tokens for the Tailscale-served APK link (S3-02 alternative).
 *
 * The APK download route is intentionally NOT behind bearer auth — a tester opens the link in
 * a browser, which has no device token. Instead the link carries this HMAC token so only the
 * daemon (which holds the secret) can mint a valid URL, and it expires. Exposure is further
 * limited to the tailnet by `tailscale serve` (never a public Funnel).
 *
 * Token form: `"<expiresAtEpochMs>.<hmacHex>"` where the HMAC covers `"<buildId>.<exp>"`.
 */
function hmacHex(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data, 'utf8').digest('hex');
}

export function signDownloadToken(secret: string, buildId: string, expiresAtMs: number): string {
  return `${expiresAtMs}.${hmacHex(secret, `${buildId}.${expiresAtMs}`)}`;
}

/** True only for a token this daemon signed for this buildId that has not yet expired. */
export function verifyDownloadToken(
  secret: string,
  buildId: string,
  token: string,
  now: number = Date.now(),
): boolean {
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isInteger(exp) || exp < now) return false;
  const expected = hmacHex(secret, `${buildId}.${exp}`);
  return constantTimeEqualHex(token.slice(dot + 1), expected);
}
