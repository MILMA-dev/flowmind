import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { prisma } from '../client';
import rateLimiter from '../middleware/rateLimiter';

interface ApiRequest extends IncomingMessage {
  query: { [key: string]: string | string[] | undefined };
  body?: unknown;
  method?: string;
  headers: IncomingMessage['headers'];
}

interface ApiResponse extends ServerResponse {
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not defined');
}

function setCors(res: ApiResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Cache-Control', 'no-store');
}

function getUserIdFromRequest(req: ApiRequest): string {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new Error('UNAUTHORIZED: Missing Authorization header');
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw new Error('UNAUTHORIZED: Empty token');
  }

  // Pure cryptographic JWT signature verification against JWT_SECRET
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('UNAUTHORIZED: Invalid JWT format');
  }

  const [header, payload, signature] = parts;
  const hmac = crypto.createHmac('sha256', JWT_SECRET);
  hmac.update(`${header}.${payload}`);
  const expectedSignature = hmac.digest('base64url');

  if (signature !== expectedSignature) {
    throw new Error('UNAUTHORIZED: JWT signature verification failed');
  }

  try {
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    // Verify token expiry
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      throw new Error('UNAUTHORIZED: Token has expired');
    }
    const userId = decodedPayload.sub || decodedPayload.id || decodedPayload.userId;
    if (userId) {
      return userId;
    }
  } catch {
    throw new Error('UNAUTHORIZED: Failed to decode JWT payload');
  }

  throw new Error('UNAUTHORIZED: User context missing in JWT');
}

function runMiddleware(req: any, res: any, fn: any) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
    if (res.writableEnded || res.finished) {
      resolve(null);
    }
  });
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (typeof res.status !== 'function') {
    res.status = function (statusCode: number): ApiResponse {
      this.statusCode = statusCode;
      return this;
    };
  }
  if (typeof res.json !== 'function') {
    res.json = function (body: unknown): void {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(body));
    };
  }

  // Apply Rate Limiter middleware
  await runMiddleware(req, res, rateLimiter);
  if (res.writableEnded) return;

  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const userId = getUserIdFromRequest(req);

    const lastSyncedAtQuery = req.query.lastSyncedAt || req.query.lastSynced;
    const lastSyncedAtStr = Array.isArray(lastSyncedAtQuery) ? lastSyncedAtQuery[0] : lastSyncedAtQuery;
    const lastSyncedAt = lastSyncedAtStr ? new Date(lastSyncedAtStr) : new Date(0);

    const [notes, todos, calendarEvents, workflows, workflowNodes, workflowEdges] = await Promise.all([
      prisma.note.findMany({
        where: {
          userId,
          updatedAt: { gt: lastSyncedAt },
        },
      }),
      prisma.todo.findMany({
        where: {
          userId,
          updatedAt: { gt: lastSyncedAt },
        },
      }),
      prisma.calendarEvent.findMany({
        where: {
          userId,
          updatedAt: { gt: lastSyncedAt },
        },
      }),
      prisma.workflow.findMany({
        where: {
          userId,
          updatedAt: { gt: lastSyncedAt },
        },
      }),
      prisma.workflowNode.findMany({
        where: {
          userId,
          updatedAt: { gt: lastSyncedAt },
        },
      }),
      prisma.workflowEdge.findMany({
        where: {
          userId,
          updatedAt: { gt: lastSyncedAt },
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      lastSyncedAt: new Date().toISOString(),
      entities: {
        notes,
        todos,
        calendarEvents,
        workflows,
        workflowNodes,
        workflowEdges,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = message.includes('UNAUTHORIZED') ? 401 : 500;
    res.status(statusCode).json({
      success: false,
      error: message,
    });
  }
}
