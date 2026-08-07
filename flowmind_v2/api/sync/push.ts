import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { prisma } from '../client';
import rateLimiter from '../middleware/rateLimiter';
import { Priority, WorkflowStatus } from '@prisma/client';
import {
  NoteSchema,
  TodoSchema,
  CalendarEventSchema,
  WorkflowSchema,
  WorkflowNodeSchema,
  WorkflowEdgeSchema,
} from '../../src/core/security/ZodSchemas';

interface ApiRequest extends IncomingMessage {
  query: { [key: string]: string | string[] | undefined };
  body?: any;
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

  // Cryptographic signature checking of JWT token
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
    // Expired verification
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

async function getRequestBody(req: ApiRequest): Promise<any> {
  if (req.body) {
    return req.body;
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', (err) => reject(err));
  });
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

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const userId = getUserIdFromRequest(req);
    const body = await getRequestBody(req);

    const {
      notes = [],
      todos = [],
      calendarEvents = [],
      workflows = [],
      workflowNodes = [],
      workflowEdges = [],
    } = body;

    // Strict Input Validation & Cleansing with Zod
    const validatedNotes = notes.map((item: any) => NoteSchema.parse(item));
    const validatedTodos = todos.map((item: any) => TodoSchema.parse(item));
    const validatedEvents = calendarEvents.map((item: any) => CalendarEventSchema.parse(item));
    const validatedWorkflows = workflows.map((item: any) => WorkflowSchema.parse(item));
    const validatedNodes = workflowNodes.map((item: any) => WorkflowNodeSchema.parse(item));
    const validatedEdges = workflowEdges.map((item: any) => WorkflowEdgeSchema.parse(item));

    // Ensure user profile profile exists in PostgreSQL
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: `${userId}@flowmind.internal`,
        displayName: `User ${userId}`,
      },
    });

    await prisma.$transaction(async (tx) => {
      // 1. Notes
      for (const note of validatedNotes) {
        const id = note.id;
        if (note.deletedAt) {
          await tx.note.upsert({
            where: { id },
            update: { deletedAt: new Date(note.deletedAt), updatedAt: new Date() },
            create: {
              id,
              userId,
              title: note.title || '',
              content: note.content || '',
              deletedAt: new Date(note.deletedAt),
            },
          });
        } else {
          await tx.note.upsert({
            where: { id },
            update: {
              title: note.title,
              content: note.content,
              folderId: note.folderId,
              tags: note.tags ? JSON.parse(JSON.stringify(note.tags)) : undefined,
              pinned: note.pinned,
              isArchived: note.isArchived,
              updatedAt: new Date(),
              deletedAt: null,
            },
            create: {
              id,
              userId,
              title: note.title,
              content: note.content,
              folderId: note.folderId,
              tags: note.tags ? JSON.parse(JSON.stringify(note.tags)) : undefined,
              pinned: note.pinned || false,
              isArchived: note.isArchived || false,
            },
          });
        }
      }

      // 2. Todos
      for (const todo of validatedTodos) {
        const id = todo.id;
        const priorityVal: Priority =
          todo.priority === 'low'
            ? Priority.LOW
            : todo.priority === 'medium'
            ? Priority.MEDIUM
            : todo.priority === 'high'
            ? Priority.HIGH
            : todo.priority === 'critical'
            ? Priority.CRITICAL
            : Priority.MEDIUM;

        if (todo.deletedAt) {
          await tx.todo.upsert({
            where: { id },
            update: { deletedAt: new Date(todo.deletedAt), updatedAt: new Date() },
            create: {
              id,
              userId,
              title: todo.title || '',
              deletedAt: new Date(todo.deletedAt),
            },
          });
        } else {
          await tx.todo.upsert({
            where: { id },
            update: {
              title: todo.title,
              description: todo.description,
              status: todo.status,
              priority: priorityVal,
              dueDate: todo.dueDate ? new Date(todo.dueDate) : null,
              listId: todo.listId,
              listName: todo.listName,
              tags: todo.tags ? JSON.parse(JSON.stringify(todo.tags)) : undefined,
              completedAt: todo.completedAt ? new Date(todo.completedAt) : null,
              updatedAt: new Date(),
              deletedAt: null,
            },
            create: {
              id,
              userId,
              title: todo.title,
              description: todo.description,
              status: todo.status || 'active',
              priority: priorityVal,
              dueDate: todo.dueDate ? new Date(todo.dueDate) : null,
              listId: todo.listId,
              listName: todo.listName,
              tags: todo.tags ? JSON.parse(JSON.stringify(todo.tags)) : undefined,
              completedAt: todo.completedAt ? new Date(todo.completedAt) : null,
            },
          });
        }
      }

      // 3. CalendarEvents
      for (const event of validatedEvents) {
        const id = event.id;
        if (event.deletedAt) {
          await tx.calendarEvent.upsert({
            where: { id },
            update: { deletedAt: new Date(event.deletedAt), updatedAt: new Date() },
            create: {
              id,
              userId,
              title: event.title || '',
              start: new Date(),
              end: new Date(),
              deletedAt: new Date(event.deletedAt),
            },
          });
        } else {
          await tx.calendarEvent.upsert({
            where: { id },
            update: {
              title: event.title,
              description: event.description,
              start: new Date(event.start),
              end: new Date(event.end),
              allDay: event.allDay || false,
              color: event.color,
              linkedTaskId: event.linkedTaskId,
              linkedNoteId: event.linkedNoteId,
              linkedNodeId: event.linkedNodeId,
              linkedWorkflowId: event.linkedWorkflowId,
              triggerFiredAt: event.triggerFiredAt ? new Date(event.triggerFiredAt) : null,
              updatedAt: new Date(),
              deletedAt: null,
            },
            create: {
              id,
              userId,
              title: event.title,
              description: event.description,
              start: new Date(event.start),
              end: new Date(event.end),
              allDay: event.allDay || false,
              color: event.color,
              linkedTaskId: event.linkedTaskId,
              linkedNoteId: event.linkedNoteId,
              linkedNodeId: event.linkedNodeId,
              linkedWorkflowId: event.linkedWorkflowId,
              triggerFiredAt: event.triggerFiredAt ? new Date(event.triggerFiredAt) : null,
            },
          });
        }
      }

      // 4. Workflows
      for (const wf of validatedWorkflows) {
        const id = wf.id;
        const statusVal: WorkflowStatus =
          wf.status === 'DRAFT'
            ? WorkflowStatus.DRAFT
            : wf.status === 'ACTIVE'
            ? WorkflowStatus.ACTIVE
            : wf.status === 'ARCHIVED'
            ? WorkflowStatus.ARCHIVED
            : WorkflowStatus.DRAFT;

        if (wf.deletedAt) {
          await tx.workflow.upsert({
            where: { id },
            update: { deletedAt: new Date(wf.deletedAt), updatedAt: new Date() },
            create: {
              id,
              userId,
              title: wf.title || '',
              deletedAt: new Date(wf.deletedAt),
            },
          });
        } else {
          await tx.workflow.upsert({
            where: { id },
            update: {
              title: wf.title,
              description: wf.description,
              status: statusVal,
              tags: wf.tags ? JSON.parse(JSON.stringify(wf.tags)) : undefined,
              color: wf.color,
              runStatus: wf.runStatus,
              lastRunAt: wf.lastRunAt ? new Date(wf.lastRunAt) : null,
              viewport: wf.viewport ? JSON.parse(JSON.stringify(wf.viewport)) : undefined,
              updatedAt: new Date(),
              deletedAt: null,
            },
            create: {
              id,
              userId,
              title: wf.title,
              description: wf.description,
              status: statusVal,
              tags: wf.tags ? JSON.parse(JSON.stringify(wf.tags)) : undefined,
              color: wf.color,
              runStatus: wf.runStatus,
              lastRunAt: wf.lastRunAt ? new Date(wf.lastRunAt) : null,
              viewport: wf.viewport ? JSON.parse(JSON.stringify(wf.viewport)) : undefined,
            },
          });
        }
      }

      // 5. WorkflowNodes
      for (const node of validatedNodes) {
        const id = node.id;
        if (node.deletedAt) {
          await tx.workflowNode.upsert({
            where: { id },
            update: { deletedAt: new Date(node.deletedAt), updatedAt: new Date() },
            create: {
              id,
              userId,
              workflowId: node.workflowId,
              type: node.type || '',
              label: node.label || '',
              x: node.x || 0,
              y: node.y || 0,
              deletedAt: new Date(node.deletedAt),
            },
          });
        } else {
          const wfExists = await tx.workflow.findUnique({ where: { id: node.workflowId } });
          if (!wfExists) {
            await tx.workflow.create({
              data: {
                id: node.workflowId,
                userId,
                title: 'Imported Workflow',
              },
            });
          }

          await tx.workflowNode.upsert({
            where: { id },
            update: {
              workflowId: node.workflowId,
              type: node.type,
              label: node.label,
              x: node.x,
              y: node.y,
              description: node.description,
              data: node.data ? JSON.parse(JSON.stringify(node.data)) : undefined,
              priority: node.priority,
              status: node.status,
              executionState: node.executionState,
              dueDate: node.dueDate ? new Date(node.dueDate) : null,
              subtasks: node.subtasks ? JSON.parse(JSON.stringify(node.subtasks)) : undefined,
              recurrence: node.recurrence ? JSON.parse(JSON.stringify(node.recurrence)) : undefined,
              progress: node.progress,
              trigger: node.trigger ? JSON.parse(JSON.stringify(node.trigger)) : undefined,
              joinMode: node.joinMode,
              executionStrategy: node.executionStrategy,
              startedAt: node.startedAt ? new Date(node.startedAt) : null,
              completedAt: node.completedAt ? new Date(node.completedAt) : null,
              updatedAt: new Date(),
              deletedAt: null,
            },
            create: {
              id,
              userId,
              workflowId: node.workflowId,
              type: node.type,
              label: node.label,
              x: node.x,
              y: node.y,
              description: node.description,
              data: node.data ? JSON.parse(JSON.stringify(node.data)) : undefined,
              priority: node.priority || 'medium',
              status: node.status || 'ready',
              executionState: node.executionState || 'ready',
              dueDate: node.dueDate ? new Date(node.dueDate) : null,
              subtasks: node.subtasks ? JSON.parse(JSON.stringify(node.subtasks)) : undefined,
              recurrence: node.recurrence ? JSON.parse(JSON.stringify(node.recurrence)) : undefined,
              progress: node.progress || 0,
              trigger: node.trigger ? JSON.parse(JSON.stringify(node.trigger)) : undefined,
              joinMode: node.joinMode || 'all',
              executionStrategy: node.executionStrategy,
              startedAt: node.startedAt ? new Date(node.startedAt) : null,
              completedAt: node.completedAt ? new Date(node.completedAt) : null,
            },
          });
        }
      }

      // 6. WorkflowEdges
      for (const edge of validatedEdges) {
        const id = edge.id;
        if (edge.deletedAt) {
          await tx.workflowEdge.upsert({
            where: { id },
            update: { deletedAt: new Date(edge.deletedAt), updatedAt: new Date() },
            create: {
              id,
              userId,
              workflowId: edge.workflowId,
              source: edge.source || '',
              target: edge.target || '',
              deletedAt: new Date(edge.deletedAt),
            },
          });
        } else {
          const wfExists = await tx.workflow.findUnique({ where: { id: edge.workflowId } });
          if (!wfExists) {
            await tx.workflow.create({
              data: {
                id: edge.workflowId,
                userId,
                title: 'Imported Workflow',
              },
            });
          }

          await tx.workflowEdge.upsert({
            where: { id },
            update: {
              workflowId: edge.workflowId,
              source: edge.source,
              target: edge.target,
              sourceHandle: edge.sourceHandle,
              targetHandle: edge.targetHandle,
              label: edge.label,
              activation: edge.activation,
              sourceSlot: edge.sourceSlot,
              targetSlot: edge.targetSlot,
              updatedAt: new Date(),
              deletedAt: null,
            },
            create: {
              id,
              userId,
              workflowId: edge.workflowId,
              source: edge.source,
              target: edge.target,
              sourceHandle: edge.sourceHandle,
              targetHandle: edge.targetHandle,
              label: edge.label,
              activation: edge.activation,
              sourceSlot: edge.sourceSlot,
              targetSlot: edge.targetSlot,
            },
          });
        }
      }
    });

    res.status(200).json({
      success: true,
      message: 'Ingestion completed successfully',
      syncedAt: new Date().toISOString(),
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
