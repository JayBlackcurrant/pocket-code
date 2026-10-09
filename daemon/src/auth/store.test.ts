import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../db/db.js';
import {
  createPairingCode,
  listDevices,
  redeemPairingCode,
  revokeDevice,
  verifyToken,
} from './store.js';
import { constantTimeEqualHex, sha256hex } from './crypto.js';

let db: Db;

beforeEach(() => {
  db = openDb(':memory:');
});
afterEach(() => {
  db.close();
});

describe('pairing', () => {
  it('redeems a valid code once and issues a token', () => {
    const { code } = createPairingCode(db);
    const res = redeemPairingCode(db, code, 'Jay iPhone');
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.token.startsWith('pc_')).toBe(true);
      expect(res.deviceId.startsWith('dev_')).toBe(true);
    }
  });

  it('rejects an unknown code', () => {
    const res = redeemPairingCode(db, 'not-a-real-code', 'phone');
    expect(res).toEqual({ ok: false, reason: 'invalid' });
  });

  it('rejects a second redemption of the same code', () => {
    const { code } = createPairingCode(db);
    expect(redeemPairingCode(db, code, 'phone').ok).toBe(true);
    expect(redeemPairingCode(db, code, 'phone')).toEqual({ ok: false, reason: 'consumed' });
  });

  it('rejects an expired code', () => {
    const { code } = createPairingCode(db, -1000); // already expired
    expect(redeemPairingCode(db, code, 'phone')).toEqual({ ok: false, reason: 'expired' });
  });
});

describe('device tokens', () => {
  it('verifies an issued token and rejects it after revoke', () => {
    const { code } = createPairingCode(db);
    const res = redeemPairingCode(db, code, 'phone');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const device = verifyToken(db, res.token);
    expect(device?.id).toBe(res.deviceId);
    expect(device?.name).toBe('phone');

    expect(revokeDevice(db, res.deviceId)).toBe(true);
    expect(verifyToken(db, res.token)).toBeNull();
    // Revoking again is a no-op.
    expect(revokeDevice(db, res.deviceId)).toBe(false);
  });

  it('rejects a garbage token', () => {
    expect(verifyToken(db, 'pc_garbage')).toBeNull();
  });

  it('lists devices including revoked ones', () => {
    const a = redeemPairingCode(db, createPairingCode(db).code, 'A');
    const b = redeemPairingCode(db, createPairingCode(db).code, 'B');
    expect(a.ok && b.ok).toBe(true);
    if (a.ok) revokeDevice(db, a.deviceId);
    const list = listDevices(db);
    expect(list).toHaveLength(2);
    expect(list.find((d) => d.name === 'A')?.revokedAt).not.toBeNull();
    expect(list.find((d) => d.name === 'B')?.revokedAt).toBeNull();
  });
});

describe('crypto', () => {
  it('constant-time hex compare matches equal hashes and rejects different ones', () => {
    const h = sha256hex('hello');
    expect(constantTimeEqualHex(h, sha256hex('hello'))).toBe(true);
    expect(constantTimeEqualHex(h, sha256hex('world'))).toBe(false);
    expect(constantTimeEqualHex(h, '')).toBe(false);
  });
});
