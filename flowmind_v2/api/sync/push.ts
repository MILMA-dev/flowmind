import type { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../client';
import { Priority, WorkflowStatus } from '@prisma/client';

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
      // Fallback
    }
  }

  return token;
}

// Read body helper for Vercel raw req/res handling (since body parser might not be present in all micro environments)
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

    // Verify current user exists in database to maintain relation integrity, or create profile if not present
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        email: `${userId}@flowmind.internal`,
        displayName: `User ${userId}`,
      },
    });

    // Execute in a single transactional batch
    await prisma.$transaction(async (tx) => {
      // 1. Process Notes
      for (const note of notes) {
        const id = note.id;
        if (note.deletedAt) {
          // Soft-delete: update deletedAt to propagate
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

      // 2. Process Todos
      for (const todo of todos) {
        const id = todo.id;
        // Priority map helper
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

      // 3. Process CalendarEvents
      for (const event of calendarEvents) {
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
              start: new Date(event.start || event.startDate),
              end: new Date(event.end || event.endDate),
              allDay: event.allDay || event.isAllDay || false,
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
              start: new Date(event.start || event.startDate),
              end: new Date(event.end || event.endDate),
              allDay: event.allDay || event.isAllDay || false,
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

      // 4. Process Workflows
      for (const wf of workflows) {
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

      // 5. Process WorkflowNodes (ensure the referenced workflows exist, or soft-delete them)
      for (const node of workflowNodes) {
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
          // Double-check referenced workflow exists before adding node to avoid FK failure
          const wfExists = await tx.workflow.findUnique({ where: { id: node.workflowId } });
          if (!wfExists) {
            // Generate dummy workflow if it doesn't exist yet in the batch
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

      // 6. Process WorkflowEdges
      for (const edge of workflowEdges) {
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
          // Double-check referenced workflow exists
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
