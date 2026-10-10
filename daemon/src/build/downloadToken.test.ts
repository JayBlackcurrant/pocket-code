import { describe, expect, it } from 'vitest';
import { signDownloadToken, verifyDownloadToken } from './downloadToken.js';

const SECRET = 'a-stable-test-secret-value';

describe('download token', () => {
  it('verifies a token it just signed (not yet expired)', () => {
    const exp = Date.now() + 60_000;
    const token = signDownloadToken(SECRET, 'b1', exp);
    expect(verifyDownloadToken(SECRET, 'b1', token)).toBe(true);
  });

  it('rejects an expired token', () => {
    const token = signDownloadToken(SECRET, 'b1', Date.now() - 1);
    expect(verifyDownloadToken(SECRET, 'b1', token)).toBe(false);
  });

  it('rejects a token signed for a different build', () => {
    const token = signDownloadToken(SECRET, 'b1', Date.now() + 60_000);
    expect(verifyDownloadToken(SECRET, 'b2', token)).toBe(false);
  });

  it('rejects a token signed with a different secret', () => {
    const token = signDownloadToken('other-secret', 'b1', Date.now() + 60_000);
    expect(verifyDownloadToken(SECRET, 'b1', token)).toBe(false);
  });

  it('rejects a tampered signature or a tampered expiry', () => {
    const exp = Date.now() + 60_000;
    const token = signDownloadToken(SECRET, 'b1', exp);
    const [e, sig] = token.split('.');
    expect(verifyDownloadToken(SECRET, 'b1', `${e}.${sig!.slice(0, -1)}0`)).toBe(false);
    // Push the expiry out without re-signing → signature no longer matches.
    expect(verifyDownloadToken(SECRET, 'b1', `${Number(e) + 1}.${sig}`)).toBe(false);
  });

  it('rejects malformed tokens', () => {
    expect(verifyDownloadToken(SECRET, 'b1', '')).toBe(false);
    expect(verifyDownloadToken(SECRET, 'b1', 'no-dot')).toBe(false);
    expect(verifyDownloadToken(SECRET, 'b1', '.abc')).toBe(false);
    expect(verifyDownloadToken(SECRET, 'b1', 'notanumber.abc')).toBe(false);
  });
});
