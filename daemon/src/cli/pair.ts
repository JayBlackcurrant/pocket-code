import QRCode from 'qrcode';
import { loadEnv } from '../config/env.js';
import { openDb } from '../db/db.js';
import { createPairingCode, PAIRING_TTL_MS } from '../auth/store.js';

/**
 * Pairing CLI — run on the Mac: `npm run pair`.
 *
 * Creates a one-time pairing code (only its hash is stored in the daemon's SQLite DB)
 * and prints a QR the phone scans. Having filesystem access to the DB is the proof of
 * being on the Mac, so no network auth is needed to mint a code. The running daemon
 * redeems the code via POST /pair.
 *
 * The QR encodes a pocketcode:// pairing URI: the advertised base URL + the code.
 */
async function main(): Promise<void> {
  const env = loadEnv();
  const db = openDb(env.dbPath);

  const { code, expiresAt } = createPairingCode(db);
  db.close();

  const payload = `pocketcode://pair?url=${encodeURIComponent(env.advertiseUrl)}&code=${encodeURIComponent(code)}`;

  const qr = await QRCode.toString(payload, { type: 'terminal', small: true });
  const ttlMin = Math.round(PAIRING_TTL_MS / 60000);

  process.stdout.write('\nScan this QR with the PocketCode app to pair:\n\n');
  process.stdout.write(qr);
  process.stdout.write(`\nConnect URL : ${env.advertiseUrl}\n`);
  process.stdout.write(`Or paste    : ${payload}\n`);
  process.stdout.write(`Expires     : ${new Date(expiresAt).toLocaleString()} (~${ttlMin} min)\n`);
  if (env.advertiseUrl.includes('127.0.0.1') || env.advertiseUrl.includes('localhost')) {
    process.stdout.write(
      '\nNote: the URL is loopback. For a phone over Tailscale, set RELAYD_ADVERTISE_URL\n' +
        '      to the Mac’s MagicDNS URL (e.g. http://my-mac.tailXXXX.ts.net:8787) and re-run.\n',
    );
  }
  process.stdout.write('\n');
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- CLI error reporting
  console.error('pairing failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
