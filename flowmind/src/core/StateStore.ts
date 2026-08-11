/**
 * FlowMind — StateStore
 * Gestionnaire d'état global réactif et normalisé
 * Équipe MILMA Entreprise
 *
 * Chaque mutation notifie l'EventBus et déclenche une sauvegarde auto.
 * Aucune vue ne doit muter une autre zone directement.
 */

import { EventBus } from './EventBus';
import {
  AppEvents,
  DEFAULT_NODE_META,
  DEFAULT_RECURRENCE,
  DEFAULT_TRIGGER,
  type AppState,
  type BrainDumpItem,
  type Activity,
  type CalendarEvent,
  type CanvasViewport,
  type ConversionTarget,
  type ExecutionState,
  type Note,
  type Subtask,
  type Task,
  type TodoList,
  type UIPreferences,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
  type ZoneId,
} from './Types';
import { StorageRepository } from '../infrastructure/StorageRepository';
import { parseCaptureInput } from './textParse';

/** Progression 0–100 d'une checklist de sous-tâches */
export function computeProgress(subtasks: Subtask[]): number {
  if (!subtasks.length) return 0;
  const done = subtasks.filter((s) => s.done).length;
  return Math.round((done / subtasks.length) * 100);
}

/** Génère un identifiant unique compact */
export function uid(prefix = 'fm'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Normalise les captures héritées (v1) vers BrainDumpItem */
function normalizeCapture(raw: Partial<BrainDumpItem> & { content?: string; id: string }): BrainDumpItem {
  const content = raw.content ?? '';
  const parsed = content ? parseCaptureInput(content) : null;
  const now = new Date().toISOString();
  return {
    id: raw.id,
    content,
    plainText: raw.plainText ?? parsed?.plainText ?? content,
    status: (raw.status as BrainDumpItem['status']) ?? 'raw',
    route: raw.route ?? null,
    routedToId: raw.routedToId ?? null,
    tags: raw.tags ?? parsed?.tags ?? [],
    priority: raw.priority ?? parsed?.priority ?? 'none',
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now,
    processedAt: raw.processedAt ?? null,
    source: raw.source ?? 'inbox',
  };
}

/** Normalise un nœud hérité vers le schéma Inspecteur + sous-tâches */
export function normalizeNode(n: Partial<WorkflowNode> & { id: string }): WorkflowNode {
  const subtasks: Subtask[] = Array.isArray(n.subtasks)
    ? n.subtasks.map((s, i) => ({
        id: s.id,
        title: s.title ?? '',
        done: Boolean(s.done),
        order: s.order ?? i,
        createdAt: s.createdAt ?? new Date().toISOString(),
        completedAt: s.completedAt ?? null,
      }))
    : [];
  const recurrence = { ...DEFAULT_RECURRENCE, ...(n.recurrence ?? {}) };
  const type = n.type ?? 'action';

  // Migration anciens status inspecteur → executionState
  const legacyMap: Record<string, ExecutionState> = {
    todo: 'ready',
    done: 'completed',
    blocked: 'locked',
    in_progress: 'in_progress',
  };
  let executionState: ExecutionState =
    n.executionState ??
    (n.status && legacyMap[n.status]
      ? legacyMap[n.status]
      : (n.status as ExecutionState)) ??
    (type === 'trigger' ? 'ready' : 'locked');

  if (
    !['locked', 'ready', 'in_progress', 'completed', 'failed', 'skipped'].includes(
      executionState
    )
  ) {
    executionState = type === 'trigger' ? 'ready' : 'locked';
  }

  const trigger = {
    ...DEFAULT_TRIGGER,
    ...(n.trigger ?? {}),
    kind:
      n.trigger?.kind ??
      (type === 'trigger' ? 'manual' : 'none'),
  };

  return {
    id: n.id,
    type,
    label: n.label ?? 'Nœud',
    x: n.x ?? 0,
    y: n.y ?? 0,
    description: n.description ?? '',
    data: n.data ?? {},
    priority: n.priority ?? DEFAULT_NODE_META.priority,
    status: executionState,
    executionState,
    dueDate: n.dueDate ?? DEFAULT_NODE_META.dueDate,
    subtasks,
    recurrence,
    progress: typeof n.progress === 'number' ? n.progress : computeProgress(subtasks),
    trigger,
    joinMode:
      n.joinMode ??
      (n.executionStrategy === 'OR'
        ? 'any'
        : n.executionStrategy === 'AND'
          ? 'all'
          : 'all'),
    executionStrategy:
      n.executionStrategy ??
      (n.joinMode === 'any' ? 'OR' : 'AND'),
    startedAt: n.startedAt ?? null,
    completedAt: n.completedAt ?? null,
  };
}

function normalizeWorkflow(raw: Workflow): Workflow {
  return {
    ...raw,
    nodes: (raw.nodes ?? []).map((n) => normalizeNode(n as WorkflowNode)),
    edges: (raw.edges ?? []).map((e) => ({
      ...e,
      sourceHandle: e.sourceHandle ?? 'output',
      targetHandle: e.targetHandle ?? 'input',
      activation: e.activation ?? 'always',
    })),
    viewport: raw.viewport ?? { x: 40, y: 40, zoom: 1 },
    runStatus: raw.runStatus ?? 'idle',
    lastRunAt: raw.lastRunAt ?? null,
  };
}

/** État initial par défaut des 5 Zones de Travail */
export function createInitialState(): AppState {
  return {
    version: 9,
    ui: {
      sidebarCollapsed: false,
      theme: 'dark',
      themeId: 'dark-neutral',
      activeZone: 'workflows',
      density: 'comfortable',
      removeCaptureOnConvert: true,
      quickCaptureOpen: false,
      activeWorkflowId: null,
      selectedNodeId: null,
      inspectorOpen: false,
      executionFilter: 'all',
      activeNoteId: null,
      notesFocusMode: false,
      calendarViewMode: 'month',
      reduceMotion: false,
      settingsOpen: false,
      microFeedback: true,
    },
    workflows: [],
    notes: [],
    folders: [
      { id: 'folder_inbox', name: 'Inbox', color: '#6366f1' },
      { id: 'folder_personal', name: 'Personnel', color: '#22d3ee' },
      { id: 'folder_ideas', name: 'Idées', color: '#a78bfa' },
    ],
    tasks: [],
    todoLists: [],
    events: [],
    activities: [],
    captures: [],
    lastSavedAt: null,
  };
}

function normalizeNote(raw: Partial<Note> & { id: string }): Note {
  const now = new Date().toISOString();
  return {
    id: raw.id,
    title: raw.title ?? 'Sans titre',
    content: raw.content ?? '',
    folderId: raw.folderId ?? null,
    tags: raw.tags ?? [],
    pinned: Boolean(raw.pinned),
    isArchived: Boolean(raw.isArchived),
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? now,
  };
}

function normalizeTodoList(raw: Partial<TodoList> & { id: string }): TodoList {
  const now = new Date().toISOString();
  return {
    id: raw.id,
    title: raw.title ?? 'Liste',
    category: raw.category ?? 'Général',
    color: raw.color ?? '#6366f1',
    items: Array.isArray(raw.items)
      ? raw.items.map((it, i) => ({
          id: it.id ?? `item_${i}`,
          text: it.text ?? '',
          isCompleted: Boolean(it.isCompleted),
          priority: it.priority ?? 'medium',
          dueDate: it.dueDate ?? null,
          createdAt: it.createdAt ?? now,
          completedAt: it.completedAt ?? null,
        }))
      : [],
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
  };
}

type Listener = (state: AppState) => void;

class StateStoreImpl {
  private state: AppState;
  private listeners: Set<Listener> = new Set();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private hydrated = false;

  constructor() {
    this.state = createInitialState();
  }

  /** Bootstrap : charge depuis StorageRepository ou initialise */
  hydrate(): AppState {
    const saved = StorageRepository.loadSync();
    if (saved && saved.version) {
      const base = createInitialState();
      const captures = Array.isArray(saved.captures)
        ? saved.captures.map((c) => normalizeCapture(c as BrainDumpItem))
        : [];
      const workflows = Array.isArray(saved.workflows)
        ? saved.workflows.map((w) => normalizeWorkflow(w as Workflow))
        : [];
      const activeWorkflowId =
        saved.ui?.activeWorkflowId &&
        workflows.some((w) => w.id === saved.ui.activeWorkflowId)
          ? saved.ui.activeWorkflowId
          : workflows[0]?.id ?? null;

      this.state = {
        ...base,
        ...saved,
        version: Math.max(base.version, saved.version ?? 1),
        ui: {
          ...base.ui,
          ...saved.ui,
          quickCaptureOpen: false,
          activeWorkflowId,
          selectedNodeId: null,
          inspectorOpen: false,
          executionFilter: saved.ui?.executionFilter ?? 'all',
          activeNoteId: saved.ui?.activeNoteId ?? null,
          notesFocusMode: false,
          calendarViewMode: saved.ui?.calendarViewMode ?? 'month',
          themeId:
            saved.ui?.themeId ??
            (saved.ui?.theme === 'light' ? 'light' : 'dark-neutral'),
          reduceMotion: saved.ui?.reduceMotion ?? false,
          settingsOpen: false,
          microFeedback: saved.ui?.microFeedback ?? true,
        },
        captures,
        workflows,
        notes: Array.isArray(saved.notes)
          ? saved.notes.map((n) => normalizeNote(n as Note))
          : [],
        folders: saved.folders?.length ? saved.folders : base.folders,
        tasks: saved.tasks ?? [],
        todoLists: Array.isArray((saved as AppState).todoLists)
          ? ((saved as AppState).todoLists as TodoList[]).map((l) =>
              normalizeTodoList(l)
            )
          : [],
        events: saved.events ?? [],
        activities: Array.isArray((saved as AppState).activities)
          ? ((saved as AppState).activities as Activity[])
          : [],
      };
      EventBus.publish(AppEvents.DATA_LOADED, { at: new Date().toISOString() });
    } else {
      this.state = createInitialState();
    }
    this.hydrated = true;
    this.notify();
    return this.state;
  }

  getState(): AppState {
    return this.state;
  }

  isHydrated(): boolean {
    return this.hydrated;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(path?: string): void {
    const snapshot = this.state;
    this.listeners.forEach((l) => l(snapshot));
    EventBus.publish(AppEvents.STATE_UPDATED, { path, state: snapshot });
    this.scheduleSave();
  }

  /** Notify sans persistance (drag live optionnel) */
  private notifySoft(path?: string): void {
    const snapshot = this.state;
    this.listeners.forEach((l) => l(snapshot));
    EventBus.publish(AppEvents.STATE_UPDATED, { path, state: snapshot });
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void this.persist();
    }, 300);
  }

  private async persist(): Promise<void> {
    try {
      const now = new Date().toISOString();
      this.state = { ...this.state, lastSavedAt: now };
      const meta = await StorageRepository.save(this.state);
      EventBus.publish(AppEvents.DATA_SAVED, { at: meta.lastSavedAt, size: meta.bytes });
    } catch (err) {
      EventBus.publish(AppEvents.ERROR, {
        source: 'StateStore.persist',
        error: String(err),
      });
    }
  }

  patch(partial: Partial<AppState>, path = 'root'): void {
    this.state = { ...this.state, ...partial };
    this.notify(path);
  }

  // ─── UI ───────────────────────────────────────────────

  setActiveZone(zone: ZoneId): void {
    const previous = this.state.ui.activeZone;
    if (previous === zone) return;
    this.state = {
      ...this.state,
      ui: { ...this.state.ui, activeZone: zone },
    };
    this.notify('ui.activeZone');
    EventBus.publish(AppEvents.ZONE_CHANGED, { zone, previous });
  }

  toggleSidebar(): void {
    const collapsed = !this.state.ui.sidebarCollapsed;
    this.state = {
      ...this.state,
      ui: { ...this.state.ui, sidebarCollapsed: collapsed },
    };
    this.notify('ui.sidebarCollapsed');
    EventBus.publish(AppEvents.SIDEBAR_TOGGLED, { collapsed });
  }

  setSidebarCollapsed(collapsed: boolean): void {
    if (this.state.ui.sidebarCollapsed === collapsed) return;
    this.state = {
      ...this.state,
      ui: { ...this.state.ui, sidebarCollapsed: collapsed },
    };
    this.notify('ui.sidebarCollapsed');
    EventBus.publish(AppEvents.SIDEBAR_TOGGLED, { collapsed });
  }

  updateUI(prefs: Partial<UIPreferences>): void {
    this.state = {
      ...this.state,
      ui: { ...this.state.ui, ...prefs },
    };
    this.notify('ui');
  }

  setQuickCaptureOpen(open: boolean): void {
    if (this.state.ui.quickCaptureOpen === open) return;
    this.state = {
      ...this.state,
      ui: { ...this.state.ui, quickCaptureOpen: open },
    };
    this.listeners.forEach((l) => l(this.state));
    EventBus.publish(open ? AppEvents.QUICK_CAPTURE_OPEN : AppEvents.QUICK_CAPTURE_CLOSE, {
      open,
    });
  }

  setActiveWorkflowId(id: string | null): void {
    if (this.state.ui.activeWorkflowId === id) return;
    this.state = {
      ...this.state,
      ui: {
        ...this.state.ui,
        activeWorkflowId: id,
        selectedNodeId: null,
        inspectorOpen: false,
      },
    };
    this.notify('ui.activeWorkflowId');
  }

  setSelectedNode(nodeId: string | null, openInspector = true): void {
    const inspectorOpen = nodeId != null && openInspector;
    if (
      this.state.ui.selectedNodeId === nodeId &&
      this.state.ui.inspectorOpen === inspectorOpen
    ) {
      return;
    }
    this.state = {
      ...this.state,
      ui: {
        ...this.state.ui,
        selectedNodeId: nodeId,
        inspectorOpen,
      },
    };
    // Soft notify : pas de spam persistance pour simple sélection UI
    this.notifySoft('ui.selection');
    if (nodeId) {
      EventBus.publish(AppEvents.NODE_SELECTED, { nodeId });
      EventBus.publish(AppEvents.INSPECTOR_OPENED, { nodeId });
    } else {
      EventBus.publish(AppEvents.NODE_DESELECTED, {});
      EventBus.publish(AppEvents.INSPECTOR_CLOSED, {});
    }
  }

  closeInspector(): void {
    if (!this.state.ui.inspectorOpen && !this.state.ui.selectedNodeId) return;
    this.state = {
      ...this.state,
      ui: {
        ...this.state.ui,
        selectedNodeId: null,
        inspectorOpen: false,
      },
    };
    this.notifySoft('ui.selection');
    EventBus.publish(AppEvents.NODE_DESELECTED, {});
    EventBus.publish(AppEvents.INSPECTOR_CLOSED, {});
  }

  /**
   * Met à jour un nœud sans republier WORKFLOW_UPDATED complet
   * (optimisé pour bascules rapides de sous-tâches).
   */
  patchNodeSoft(
    workflowId: string,
    nodeId: string,
    patch: Partial<WorkflowNode>
  ): void {
    const now = new Date().toISOString();
    this.state = {
      ...this.state,
      workflows: this.state.workflows.map((w) =>
        w.id === workflowId
          ? {
              ...w,
              updatedAt: now,
              nodes: w.nodes.map((n) =>
                n.id === nodeId ? normalizeNode({ ...n, ...patch, id: nodeId }) : n
              ),
            }
          : w
      ),
    };
    this.notifySoft('workflows.nodes.patch');
    this.scheduleSave();
    EventBus.publish(AppEvents.NODE_UPDATED, { workflowId, nodeId, patch });
  }

  // ─── Captures (Brain Dump) ────────────────────────────

  addCapture(item: BrainDumpItem): void {
    this.state = {
      ...this.state,
      captures: [item, ...this.state.captures],
    };
    this.notify('captures');
  }

  updateCapture(item: BrainDumpItem): void {
    this.state = {
      ...this.state,
      captures: this.state.captures.map((c) => (c.id === item.id ? item : c)),
    };
    this.notify('captures');
  }

  removeCapture(id: string): void {
    this.state = {
      ...this.state,
      captures: this.state.captures.filter((c) => c.id !== id),
    };
    this.notify('captures');
  }

  markCaptureConverted(
    id: string,
    route: ConversionTarget,
    routedToId: string,
    remove: boolean
  ): void {
    if (remove) {
      this.state = {
        ...this.state,
        captures: this.state.captures.filter((c) => c.id !== id),
      };
    } else {
      const now = new Date().toISOString();
      this.state = {
        ...this.state,
        captures: this.state.captures.map((c) =>
          c.id === id
            ? {
                ...c,
                status: 'converted' as const,
                route,
                routedToId,
                processedAt: now,
                updatedAt: now,
              }
            : c
        ),
      };
    }
    this.notify('captures');
  }

  setCaptures(captures: BrainDumpItem[]): void {
    this.state = { ...this.state, captures };
    this.notify('captures');
  }

  // ─── Notes / Tasks / TodoLists / Events ───────────────

  addNote(note: Note): void {
    const n = normalizeNote(note);
    this.state = {
      ...this.state,
      notes: [n, ...this.state.notes],
      ui: { ...this.state.ui, activeNoteId: n.id },
    };
    this.notify('notes');
    EventBus.publish(AppEvents.NOTE_UPDATED, { notes: this.state.notes });
  }

  updateNote(note: Note): void {
    const n = normalizeNote(note);
    this.state = {
      ...this.state,
      notes: this.state.notes.map((x) => (x.id === n.id ? n : x)),
    };
    this.notify('notes');
  }

  removeNote(id: string): void {
    const next = this.state.notes.filter((n) => n.id !== id);
    const active =
      this.state.ui.activeNoteId === id ? next[0]?.id ?? null : this.state.ui.activeNoteId;
    this.state = {
      ...this.state,
      notes: next,
      ui: { ...this.state.ui, activeNoteId: active },
    };
    this.notify('notes');
  }

  setNotes(notes: Note[]): void {
    this.state = { ...this.state, notes: notes.map(normalizeNote) };
    this.notify('notes');
    EventBus.publish(AppEvents.NOTE_UPDATED, { notes: this.state.notes });
  }

  setActiveNoteId(id: string | null): void {
    if (this.state.ui.activeNoteId === id) return;
    this.state = {
      ...this.state,
      ui: { ...this.state.ui, activeNoteId: id },
    };
    this.notifySoft('ui.activeNoteId');
    this.scheduleSave();
  }

  setNotesFocusMode(on: boolean): void {
    if (this.state.ui.notesFocusMode === on) return;
    this.state = {
      ...this.state,
      ui: { ...this.state.ui, notesFocusMode: on },
    };
    this.notifySoft('ui.notesFocusMode');
  }

  addTask(task: Task): void {
    this.state = { ...this.state, tasks: [task, ...this.state.tasks] };
    this.notify('tasks');
    EventBus.publish(AppEvents.TASK_UPDATED, { tasks: this.state.tasks });
  }

  setTasks(tasks: Task[]): void {
    this.state = { ...this.state, tasks };
    this.notify('tasks');
    EventBus.publish(AppEvents.TASK_UPDATED, { tasks });
  }

  addTodoList(list: TodoList): void {
    const l = normalizeTodoList(list);
    this.state = { ...this.state, todoLists: [l, ...this.state.todoLists] };
    this.notify('todoLists');
  }

  updateTodoList(list: TodoList): void {
    const l = normalizeTodoList(list);
    this.state = {
      ...this.state,
      todoLists: this.state.todoLists.map((x) => (x.id === l.id ? l : x)),
    };
    this.notify('todoLists');
  }

  removeTodoList(id: string): void {
    this.state = {
      ...this.state,
      todoLists: this.state.todoLists.filter((l) => l.id !== id),
    };
    this.notify('todoLists');
  }

  setTodoLists(lists: TodoList[]): void {
    this.state = { ...this.state, todoLists: lists.map(normalizeTodoList) };
    this.notify('todoLists');
  }

  addEvent(event: CalendarEvent): void {
    this.state = { ...this.state, events: [event, ...this.state.events] };
    this.notify('events');
    EventBus.publish(AppEvents.EVENT_UPDATED, { events: this.state.events });
  }

  updateEvent(event: CalendarEvent): void {
    this.state = {
      ...this.state,
      events: this.state.events.map((e) => (e.id === event.id ? event : e)),
    };
    this.notify('events');
    EventBus.publish(AppEvents.EVENT_UPDATED, { events: this.state.events });
  }

  removeEvent(id: string): void {
    this.state = {
      ...this.state,
      events: this.state.events.filter((e) => e.id !== id),
    };
    this.notify('events');
    EventBus.publish(AppEvents.EVENT_UPDATED, { events: this.state.events });
  }

  setEvents(events: CalendarEvent[]): void {
    this.state = { ...this.state, events };
    this.notify('events');
    EventBus.publish(AppEvents.EVENT_UPDATED, { events });
  }

  // ─── Activities (planification multi-jours) ───────────

  addActivity(activity: Activity): void {
    this.state = {
      ...this.state,
      activities: [activity, ...this.state.activities],
    };
    this.notify('activities');
  }

  updateActivity(activity: Activity): void {
    this.state = {
      ...this.state,
      activities: this.state.activities.map((a) =>
        a.id === activity.id ? activity : a
      ),
    };
    this.notify('activities');
  }

  removeActivity(id: string): void {
    this.state = {
      ...this.state,
      activities: this.state.activities.filter((a) => a.id !== id),
    };
    this.notify('activities');
  }

  setActivities(activities: Activity[]): void {
    this.state = { ...this.state, activities };
    this.notify('activities');
  }

  // ─── Workflows Nodaux ─────────────────────────────────

  addWorkflow(workflow: Workflow): void {
    this.state = {
      ...this.state,
      workflows: [workflow, ...this.state.workflows],
      ui: {
        ...this.state.ui,
        activeWorkflowId: this.state.ui.activeWorkflowId ?? workflow.id,
      },
    };
    this.notify('workflows');
    EventBus.publish(AppEvents.WORKFLOW_UPDATED, { workflows: this.state.workflows });
  }

  setWorkflows(workflows: Workflow[]): void {
    this.state = { ...this.state, workflows };
    this.notify('workflows');
    EventBus.publish(AppEvents.WORKFLOW_UPDATED, { workflows });
  }

  updateWorkflow(
    workflowId: string,
    patch: Partial<Workflow>,
    touchUpdatedAt = true
  ): void {
    const now = new Date().toISOString();
    this.state = {
      ...this.state,
      workflows: this.state.workflows.map((w) =>
        w.id === workflowId
          ? {
              ...w,
              ...patch,
              updatedAt: touchUpdatedAt ? now : (patch.updatedAt ?? w.updatedAt),
            }
          : w
      ),
    };
    this.notify('workflows');
    EventBus.publish(AppEvents.WORKFLOW_UPDATED, { workflows: this.state.workflows });
  }

  removeWorkflow(workflowId: string): void {
    const next = this.state.workflows.filter((w) => w.id !== workflowId);
    const active =
      this.state.ui.activeWorkflowId === workflowId
        ? next[0]?.id ?? null
        : this.state.ui.activeWorkflowId;
    this.state = {
      ...this.state,
      workflows: next,
      ui: { ...this.state.ui, activeWorkflowId: active },
    };
    this.notify('workflows');
    EventBus.publish(AppEvents.WORKFLOW_UPDATED, { workflows: next });
  }

  addNodeToWorkflow(workflowId: string, node: WorkflowNode): void {
    const now = new Date().toISOString();
    const normalized = normalizeNode(node);
    this.state = {
      ...this.state,
      workflows: this.state.workflows.map((w) =>
        w.id === workflowId
          ? { ...w, nodes: [...w.nodes, normalized], updatedAt: now }
          : w
      ),
    };
    this.notify('workflows');
    EventBus.publish(AppEvents.WORKFLOW_UPDATED, { workflows: this.state.workflows });
  }

  moveNode(workflowId: string, nodeId: string, x: number, y: number): void {
    const now = new Date().toISOString();
    this.state = {
      ...this.state,
      workflows: this.state.workflows.map((w) =>
        w.id === workflowId
          ? {
              ...w,
              updatedAt: now,
              nodes: w.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
            }
          : w
      ),
    };
    // Debounced save — notify normal
    this.notify('workflows.nodes');
  }

  /** Déplacement live (pendant drag) — soft notify + save debounce */
  moveNodeLive(workflowId: string, nodeId: string, x: number, y: number): void {
    this.state = {
      ...this.state,
      workflows: this.state.workflows.map((w) =>
        w.id === workflowId
          ? {
              ...w,
              nodes: w.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
            }
          : w
      ),
    };
    this.notifySoft('workflows.nodes.live');
    this.scheduleSave();
  }

  updateNode(
    workflowId: string,
    nodeId: string,
    patch: Partial<WorkflowNode>
  ): void {
    const now = new Date().toISOString();
    this.state = {
      ...this.state,
      workflows: this.state.workflows.map((w) =>
        w.id === workflowId
          ? {
              ...w,
              updatedAt: now,
              nodes: w.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
            }
          : w
      ),
    };
    this.notify('workflows.nodes');
    EventBus.publish(AppEvents.WORKFLOW_UPDATED, { workflows: this.state.workflows });
  }

  removeNode(workflowId: string, nodeId: string): void {
    const now = new Date().toISOString();
    this.state = {
      ...this.state,
      workflows: this.state.workflows.map((w) =>
        w.id === workflowId
          ? {
              ...w,
              updatedAt: now,
              nodes: w.nodes.filter((n) => n.id !== nodeId),
              edges: w.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
            }
          : w
      ),
    };
    this.notify('workflows');
    EventBus.publish(AppEvents.WORKFLOW_UPDATED, { workflows: this.state.workflows });
  }

  addEdgeToWorkflow(workflowId: string, edge: WorkflowEdge): void {
    const now = new Date().toISOString();
    this.state = {
      ...this.state,
      workflows: this.state.workflows.map((w) =>
        w.id === workflowId
          ? { ...w, edges: [...w.edges, edge], updatedAt: now }
          : w
      ),
    };
    this.notify('workflows.edges');
    EventBus.publish(AppEvents.WORKFLOW_UPDATED, { workflows: this.state.workflows });
  }

  removeEdge(workflowId: string, edgeId: string): void {
    const now = new Date().toISOString();
    this.state = {
      ...this.state,
      workflows: this.state.workflows.map((w) =>
        w.id === workflowId
          ? {
              ...w,
              updatedAt: now,
              edges: w.edges.filter((e) => e.id !== edgeId),
            }
          : w
      ),
    };
    this.notify('workflows.edges');
    EventBus.publish(AppEvents.WORKFLOW_UPDATED, { workflows: this.state.workflows });
  }

  setWorkflowViewport(workflowId: string, viewport: CanvasViewport): void {
    this.state = {
      ...this.state,
      workflows: this.state.workflows.map((w) =>
        w.id === workflowId ? { ...w, viewport } : w
      ),
    };
    this.scheduleSave();
  }

  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await this.persist();
  }
}

/** Instance singleton du store */
export const StateStore = new StateStoreImpl();
export default StateStore;
