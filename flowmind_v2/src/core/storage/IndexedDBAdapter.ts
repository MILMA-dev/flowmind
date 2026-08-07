import Dexie, { type Table } from 'dexie';

export interface NoteDB {
  id: string;
  userId: string;
  title: string;
  content: string;
  folderId: string | null;
  tags: string; // JSON string array
  pinned: number; // 0 or 1 for IndexedDB indexing
  isArchived: number; // 0 or 1
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncedAt: string | null;
  isDirty: number; // 0 or 1
  _fieldUpdates: string; // JSON string representing Record<string, string>
}

export interface TodoDB {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: string; // 'inbox' | 'active' | 'blocked' | 'done' | 'archived'
  priority: string; // 'low' | 'medium' | 'high' | 'critical'
  dueDate: string | null;
  listId: string | null;
  listName: string | null;
  tags: string; // JSON string array
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncedAt: string | null;
  isDirty: number; // 0 or 1
  _fieldUpdates: string; // JSON string representing Record<string, string>
}

export interface CalendarEventDB {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  allDay: number; // 0 or 1
  color: string | null;
  linkedTaskId: string | null;
  linkedNoteId: string | null;
  linkedNodeId: string | null;
  linkedWorkflowId: string | null;
  triggerFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncedAt: string | null;
  isDirty: number; // 0 or 1
  _fieldUpdates: string; // JSON string representing Record<string, string>
}

export interface WorkflowDB {
  id: string;
  userId: string;
  title: string;
  description: string | null;
  status: string; // 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  tags: string; // JSON string array
  color: string | null;
  runStatus: string | null;
  lastRunAt: string | null;
  viewport: string | null; // JSON string
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncedAt: string | null;
  isDirty: number; // 0 or 1
  _fieldUpdates: string; // JSON string representing Record<string, string>
}

export interface WorkflowNodeDB {
  id: string;
  userId: string;
  workflowId: string;
  type: string;
  label: string;
  x: number;
  y: number;
  description: string | null;
  data: string | null; // JSON string
  priority: string;
  status: string;
  executionState: string;
  dueDate: string | null;
  subtasks: string; // JSON string
  recurrence: string | null; // JSON string
  progress: number;
  trigger: string | null; // JSON string
  joinMode: string;
  executionStrategy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncedAt: string | null;
  isDirty: number; // 0 or 1
  _fieldUpdates: string; // JSON string representing Record<string, string>
}

export interface WorkflowEdgeDB {
  id: string;
  userId: string;
  workflowId: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  label: string | null;
  activation: string | null;
  sourceSlot: number | null;
  targetSlot: number | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncedAt: string | null;
  isDirty: number; // 0 or 1
  _fieldUpdates: string; // JSON string representing Record<string, string>
}

export interface OfflineMutation {
  id?: number;
  userId: string;
  entityType: 'note' | 'todo' | 'calendarEvent' | 'workflow' | 'workflowNode' | 'workflowEdge';
  entityId: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  payload: Record<string, any>;
  timestamp: string;
  retryCount: number;
  status?: 'PENDING' | 'FAILED' | 'SUCCESS';
}

class FlowMindDexie extends Dexie {
  notes!: Table<NoteDB, string>;
  todos!: Table<TodoDB, string>;
  calendarEvents!: Table<CalendarEventDB, string>;
  workflows!: Table<WorkflowDB, string>;
  workflowNodes!: Table<WorkflowNodeDB, string>;
  workflowEdges!: Table<WorkflowEdgeDB, string>;
  offline_mutations!: Table<OfflineMutation, number>;

  constructor() {
    super('FlowMindOfflineDB');
    this.version(1).stores({
      notes: 'id, userId, isDirty, updatedAt, [userId+isDirty]',
      todos: 'id, userId, isDirty, updatedAt, [userId+isDirty]',
      calendarEvents: 'id, userId, isDirty, updatedAt, [userId+isDirty]',
      workflows: 'id, userId, isDirty, updatedAt, [userId+isDirty]',
      workflowNodes: 'id, userId, isDirty, updatedAt, [userId+isDirty], workflowId',
      workflowEdges: 'id, userId, isDirty, updatedAt, [userId+isDirty], workflowId',
      offline_mutations: '++id, userId, entityId, entityType, timestamp, status',
    });
  }
}

export const db = new FlowMindDexie();
export default db;
