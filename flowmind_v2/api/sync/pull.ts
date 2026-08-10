import type { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../client.js';
import rateLimiter from '../middleware/rateLimiter.js';

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

function setCors(res: ApiResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  res.setHeader('Cache-Control', 'no-store');
}

async function getUserIdFromRequest(req: ApiRequest): Promise<string> {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new Error('UNAUTHORIZED: Missing Authorization header');
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw new Error('UNAUTHORIZED: Empty token');
  }

  // Résout la session opaque de façon sécurisée directement contre la base PostgreSQL
  const user = await prisma.user.findUnique({
    where: { sessionToken: token },
  });

  if (!user) {
    throw new Error('UNAUTHORIZED: Invalid or expired session token');
  }

  return user.id;
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
    const userId = await getUserIdFromRequest(req);

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
