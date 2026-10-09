import { randomBytes } from 'node:crypto';
import type { Db } from '../db/db.js';
import {
  constantTimeEqualHex,
  generatePairingCode,
  generateToken,
  sha256hex,
} from './crypto.js';

export interface Device {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number | null;
  revokedAt: number | null;
}

/** Default lifetime of a pairing code. */
export const PAIRING_TTL_MS = 5 * 60 * 1000;

function now(): number {
  return Date.now();
}

/**
 * Create a one-time pairing code and persist only its hash. Returns the RAW code to
 * embed in the QR. Called on the Mac (by the pairing CLI).
 */
export function createPairingCode(db: Db, ttlMs: number = PAIRING_TTL_MS): {
  code: string;
  expiresAt: number;
} {
  const code = generatePairingCode();
  const createdAt = now();
  const expiresAt = createdAt + ttlMs;
  db.prepare(
    'INSERT INTO pairing_codes (code_hash, created_at, expires_at) VALUES (?, ?, ?)',
  ).run(sha256hex(code), createdAt, expiresAt);
  return { code, expiresAt };
}

/** Remove expired, unconsumed codes. Safe to call opportunistically. */
export function pruneExpiredPairingCodes(db: Db): void {
  db.prepare('DELETE FROM pairing_codes WHERE consumed_at IS NULL AND expires_at < ?').run(now());
}

export type RedeemResult =
  | { ok: true; deviceId: string; token: string }
  | { ok: false; reason: 'invalid' | 'expired' | 'consumed' };

/**
 * Redeem a pairing code: validate it, consume it atomically, create a device, and
 * return the raw bearer token (shown once). Called by a phone via POST /pair.
 */
export function redeemPairingCode(db: Db, code: string, deviceName: string): RedeemResult {
  const codeHash = sha256hex(code);
  const txn = db.transaction((): RedeemResult => {
    const row = db
      .prepare(
        'SELECT code_hash, expires_at, consumed_at FROM pairing_codes WHERE code_hash = ?',
      )
      .get(codeHash) as { code_hash: string; expires_at: number; consumed_at: number | null } | undefined;

    // Verify with a constant-time compare even though we looked up by hash.
    if (!row || !constantTimeEqualHex(row.code_hash, codeHash)) {
      return { ok: false, reason: 'invalid' };
    }
    if (row.consumed_at !== null) return { ok: false, reason: 'consumed' };
    if (row.expires_at < now()) return { ok: false, reason: 'expired' };

    const consumed = db
      .prepare('UPDATE pairing_codes SET consumed_at = ? WHERE code_hash = ? AND consumed_at IS NULL')
      .run(now(), codeHash);
    // Guard against a race: if another request consumed it first, bail.
    if (consumed.changes !== 1) return { ok: false, reason: 'consumed' };

    const deviceId = 'dev_' + randomBytes(8).toString('base64url');
    const token = generateToken();
    db.prepare(
      'INSERT INTO devices (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)',
    ).run(deviceId, deviceName, sha256hex(token), now());

    return { ok: true, deviceId, token };
  });
  return txn();
}

/**
 * Verify a presented bearer token. Returns the active device or null. Updates
 * last_seen_at on success. Revoked devices never match.
 */
export function verifyToken(db: Db, token: string): Device | null {
  const tokenHash = sha256hex(token);
  const row = db
    .prepare(
      'SELECT id, name, token_hash, created_at, last_seen_at, revoked_at FROM devices WHERE token_hash = ?',
    )
    .get(tokenHash) as
    | {
        id: string;
        name: string;
        token_hash: string;
        created_at: number;
        last_seen_at: number | null;
        revoked_at: number | null;
      }
    | undefined;

  if (!row || row.revoked_at !== null) return null;
  if (!constantTimeEqualHex(row.token_hash, tokenHash)) return null;

  db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(now(), row.id);
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastSeenAt: now(),
    revokedAt: null,
  };
}

export function listDevices(db: Db): Device[] {
  const rows = db
    .prepare(
      'SELECT id, name, created_at, last_seen_at, revoked_at FROM devices ORDER BY created_at DESC',
    )
    .all() as Array<{
    id: string;
    name: string;
    created_at: number;
    last_seen_at: number | null;
    revoked_at: number | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at,
    revokedAt: r.revoked_at,
  }));
}

/** Revoke a device's token. Returns true if a device was revoked. */
export function revokeDevice(db: Db, id: string): boolean {
  const res = db
    .prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
    .run(now(), id);
  return res.changes === 1;
}
