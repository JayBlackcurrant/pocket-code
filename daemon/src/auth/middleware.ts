import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { Db } from '../db/db.js';
import { verifyToken, type Device } from './store.js';

declare module 'fastify' {
  interface FastifyRequest {
    device?: Device;
  }
}

function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer (.+)$/.exec(header.trim());
  return match ? (match[1] ?? null) : null;
}

/**
 * preHandler that requires a valid device bearer token. Attach to protected routes.
 * Unpaired/invalid/revoked tokens get 401. Never logs the token itself.
 */
export function requireAuth(db: Db): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      return reply.code(401).send({ error: 'missing bearer token' });
    }
    const device = verifyToken(db, token);
    if (!device) {
      return reply.code(401).send({ error: 'invalid or revoked token' });
    }
    req.device = device;
  };
}
