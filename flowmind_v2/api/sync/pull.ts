import type { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../client';

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

function getUserIdFromRequest(req: ApiRequest): string {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new Error('UNAUTHORIZED: Missing Authorization header');
  }
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    throw new Error('UNAUTHORIZED: Empty token');
  }

  const parts = token.split('.');
  if (parts.length === 3) {
    try {
      const payloadBase64 = parts[1];
      const decodedPayload = Buffer.from(payloadBase64, 'base64').toString('utf8');
      const payload = JSON.parse(decodedPayload) as { sub?: string; id?: string; userId?: string };
      const userId = payload.sub || payload.id || payload.userId;
      if (userId) {
        return userId;
      }
    } catch {
      // Fallback to raw token
    }
  }

  return token;
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  // Ensure status and json helpers are attached
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

    // Extract lastSyncedAt
    const lastSyncedAtQuery = req.query.lastSyncedAt || req.query.lastSynced;
    const lastSyncedAtStr = Array.isArray(lastSyncedAtQuery) ? lastSyncedAtQuery[0] : lastSyncedAtQuery;
    const lastSyncedAt = lastSyncedAtStr ? new Date(lastSyncedAtStr) : new Date(0);

    // Fetch updated/created/deleted entities since lastSyncedAt
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
