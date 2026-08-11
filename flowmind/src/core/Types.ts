/**
 * FlowMind — Types & contrats d'entités
 * Équipe MILMA Entreprise — Personal OS
 * Définitions normalisées des Zones de Travail et Système de Capture Unit
 */

/** Identifiants des 5 Zones de Travail */
export type ZoneId =
  | 'workflows'
  | 'notes'
  | 'todos'
  | 'calendar'
  | 'braindump';

export const ZONE_META: Record<
  ZoneId,
  { label: string; shortLabel: string; description: string }
> = {
  workflows: {
    label: 'Workflows Nodaux',
    shortLabel: 'Workflows',
    description: 'Orchestration visuelle de vos flux personnels',
  },
  notes: {
    label: 'Notes Dek',
    shortLabel: 'Notes',
    description: 'Espace de rédaction et de connaissance',
  },
  todos: {
    label: "Unités d'Action",
    shortLabel: 'Actions',
    description: 'Tâches indépendantes & priorités',
  },
  calendar: {
    label: 'Planification',
    shortLabel: 'Agenda',
    description: 'Calendrier & blocs temporels',
  },
  braindump: {
    label: 'Brain Dump & Inbox',
    shortLabel: 'Capture',
    description: 'Système de Capture Unit rapide',
  },
};

// ─── Workflows Nodaux ────────────────────────────────────

/** Types de nœuds (anatomie n8n / Personal OS) */
export type NodeType =
  | 'trigger'
  | 'action'
  | 'routine'
  | 'goal'
  | 'condition'
  | 'output'
  | 'note';

export const NODE_TYPE_META: Record<
  NodeType,
  { label: string; color: string; ring: string; bg: string }
> = {
  trigger: {
    label: 'Trigger',
    color: '#34d399',
    ring: 'rgba(52,211,153,0.35)',
    bg: 'rgba(52,211,153,0.12)',
  },
  action: {
    label: 'Action',
    color: '#818cf8',
    ring: 'rgba(129,140,248,0.35)',
    bg: 'rgba(129,140,248,0.12)',
  },
  routine: {
    label: 'Routine',
    color: '#22d3ee',
    ring: 'rgba(34,211,238,0.35)',
    bg: 'rgba(34,211,238,0.12)',
  },
  goal: {
    label: 'Goal',
    color: '#fbbf24',
    ring: 'rgba(251,191,36,0.35)',
    bg: 'rgba(251,191,36,0.12)',
  },
  condition: {
    label: 'Condition',
    color: '#fb923c',
    ring: 'rgba(251,146,60,0.35)',
    bg: 'rgba(251,146,60,0.12)',
  },
  output: {
    label: 'Output',
    color: '#c084fc',
    ring: 'rgba(192,132,252,0.35)',
    bg: 'rgba(192,132,252,0.12)',
  },
  note: {
    label: 'Note',
    color: '#94a3b8',
    ring: 'rgba(148,163,184,0.35)',
    bg: 'rgba(148,163,184,0.12)',
  },
};

/** Dimensions standard d'un nœud canvas (px world-space) */
export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 88;

/** Priorité d'un nœud inspecté */
export type NodePriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Machine à états d'exécution (Workflow Engine)
 * Locked → Ready → In_Progress → Completed | Failed | Skipped
 */
export type ExecutionState =
  | 'locked'
  | 'ready'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'skipped';

/** Alias rétrocompatible inspecteur */
export type NodeStatus = ExecutionState;

export const EXECUTION_STATE_META: Record<
  ExecutionState,
  { label: string; color: string; bg: string; ring: string }
> = {
  locked: {
    label: 'Verrouillé',
    color: '#71717a',
    bg: 'rgba(113,113,122,0.12)',
    ring: 'rgba(113,113,122,0.35)',
  },
  ready: {
    label: 'Prêt',
    color: '#38bdf8',
    bg: 'rgba(56,189,248,0.12)',
    ring: 'rgba(56,189,248,0.4)',
  },
  in_progress: {
    label: 'En cours',
    color: '#fb923c',
    bg: 'rgba(251,146,60,0.14)',
    ring: 'rgba(251,146,60,0.45)',
  },
  completed: {
    label: 'Terminé',
    color: '#34d399',
    bg: 'rgba(52,211,153,0.14)',
    ring: 'rgba(52,211,153,0.45)',
  },
  failed: {
    label: 'Échoué',
    color: '#f43f5e',
    bg: 'rgba(244,63,94,0.14)',
    ring: 'rgba(244,63,94,0.45)',
  },
  skipped: {
    label: 'Ignoré',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.12)',
    ring: 'rgba(167,139,250,0.35)',
  },
};

/** Type de déclencheur */
export type TriggerKind = 'manual' | 'time' | 'event' | 'none';

/** Configuration d'un nœud Trigger */
export interface TriggerConfig {
  kind: TriggerKind;
  /** Heure HH:mm pour time-based (quotidien) */
  timeOfDay?: string;
  /** Événement EventBus à écouter (ex: BRAIN_DUMP_ITEM_CONVERTED) */
  eventName?: string;
  enabled: boolean;
  lastFiredAt: string | null;
}

export type JoinMode = 'all' | 'any';

/**
 * Porte logique d'activation N→1 (alias sémantique de joinMode)
 * AND = tous les parents Completed · OR = au moins un parent Completed
 */
export type ExecutionStrategy = 'AND' | 'OR';

export function joinModeToStrategy(m: JoinMode | undefined): ExecutionStrategy {
  return m === 'any' ? 'OR' : 'AND';
}

export function strategyToJoinMode(s: ExecutionStrategy | undefined): JoinMode {
  return s === 'OR' ? 'any' : 'all';
}

/** Activation conditionnelle d'une arête */
export type EdgeActivation = 'always' | 'on_success' | 'on_failure';

export const DEFAULT_TRIGGER: TriggerConfig = {
  kind: 'manual',
  enabled: true,
  lastFiredAt: null,
};

/** Sous-tâche hiérarchique rattachée à un nœud parent */
export interface Subtask {
  id: string;
  title: string;
  done: boolean;
  order: number;
  createdAt: string;
  completedAt: string | null;
}

/** Fréquence de récurrence (routines) */
export type RecurrenceFrequency =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'custom';

/** Unité d'intervalle personnalisé */
export type RecurrenceIntervalUnit = 'hours' | 'days';

/** Comportement à l'échéance de récurrence */
export type RecurrenceOnComplete = 'reset' | 'duplicate';

/**
 * Règle de récurrence — évaluée par RecurrenceEngine
 * (logique cron-like simplifiée côté client)
 */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** Pour custom : tous les N hours/days */
  interval: number;
  intervalUnit: RecurrenceIntervalUnit;
  onComplete: RecurrenceOnComplete;
  /** Prochaine évaluation ISO */
  nextRunAt: string | null;
  lastRunAt: string | null;
  enabled: boolean;
}

/** Métadonnées enrichies du nœud (Inspecteur) */
export interface NodeMetadata {
  priority: NodePriority;
  status: NodeStatus;
  dueDate: string | null;
}

export const DEFAULT_RECURRENCE: RecurrenceRule = {
  frequency: 'none',
  interval: 1,
  intervalUnit: 'days',
  onComplete: 'reset',
  nextRunAt: null,
  lastRunAt: null,
  enabled: false,
};

export const DEFAULT_NODE_META: NodeMetadata = {
  priority: 'medium',
  status: 'ready',
  dueDate: null,
};

/** Nœud d'un Workflow Nodal (style n8n) */
export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  x: number;
  y: number;
  description?: string;
  data?: Record<string, unknown>;
  /** Métadonnées d'inspection */
  priority: NodePriority;
  /** @deprecated utiliser executionState — conservé pour compat inspecteur */
  status: NodeStatus;
  /** Machine à états d'exécution */
  executionState: ExecutionState;
  dueDate: string | null;
  /** Checklist hiérarchique */
  subtasks: Subtask[];
  /** Règle de récurrence (surtout type routine) */
  recurrence: RecurrenceRule;
  /** Progression 0–100 mise en cache (évite recalcul canvas superflu) */
  progress: number;
  /** Config trigger (nœuds type trigger ou tout nœud démarrable) */
  trigger: TriggerConfig;
  /** ET (all parents) / OU (any parent) pour déverrouillage N→1 */
  joinMode: JoinMode;
  /**
   * Stratégie d'exécution explicite (AND/OR).
   * Synchronisée avec joinMode : AND↔all, OR↔any
   */
  executionStrategy?: ExecutionStrategy;
  startedAt: string | null;
  completedAt: string | null;
}

/** Alias demandé par le contrat */
export type Node = WorkflowNode;

/** Connexion entre deux nœuds (courbe de Bézier) — multi 1→N et N→1 autorisé */
export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  /** Ancre de sortie (droite) */
  sourceHandle?: 'output' | string;
  /** Ancre d'entrée (gauche) */
  targetHandle?: 'input' | string;
  label?: string;
  /** Condition d'activation partielle */
  activation?: EdgeActivation;
  /** Index de fan-out / fan-in pour décalage visuel des courbes */
  sourceSlot?: number;
  targetSlot?: number;
}

/** Fichier .flowmind.json — export d'un workflow isolé */
export interface WorkflowExportSchema {
  format: 'flowmind-workflow';
  version: number;
  exportedAt: string;
  workflow: Workflow;
}

/** Impulsion visuelle le long d'une connexion */
export interface FlowPulse {
  id: string;
  edgeId: string;
  workflowId: string;
  createdAt: number;
  kind: 'success' | 'failure' | 'activate';
}

/** Snapshot d'exécution d'un workflow */
export interface ExecutionGraph {
  workflowId: string;
  roots: string[];
  adjacency: Record<string, string[]>;
  reverse: Record<string, string[]>;
}

/** Alias contrat : Connection */
export type Connection = WorkflowEdge;

/** Viewport canvas (pan + zoom) */
export interface CanvasViewport {
  x: number;
  y: number;
  zoom: number;
}

/** Statut d'exécution global du workflow */
export type WorkflowRunStatus = 'idle' | 'running' | 'completed' | 'failed';

/** Workflow Nodal complet */
export interface Workflow {
  id: string;
  title: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  updatedAt: string;
  createdAt: string;
  tags: string[];
  color: string;
  /** Dernier viewport mémorisé */
  viewport?: CanvasViewport;
  runStatus?: WorkflowRunStatus;
  lastRunAt?: string | null;
}

/** Note dans Notes Dek */
/** Tag de note (alias NoteTag) */
export type NoteTag = string;

export interface Note {
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  tags: NoteTag[];
  pinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteFolder {
  id: string;
  name: string;
  color: string;
}

/** Unité d'Action (Task) — pas une "todo list classique" */
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';
export type TaskStatus = 'inbox' | 'active' | 'blocked' | 'done' | 'archived';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  projectId: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

/**
 * Élément d'une Liste d'Unités d'Action (TodoItem)
 * Terminologie FlowMind : Unité élémentaire dans une Liste d'Action
 */
export interface TodoItem {
  id: string;
  text: string;
  isCompleted: boolean;
  priority: 'low' | 'medium' | 'high';
  dueDate: string | null;
  createdAt: string;
  completedAt: string | null;
}

/**
 * Liste d'Unités d'Action indépendante (TodoList / multi-projets)
 */
export interface TodoList {
  id: string;
  title: string;
  category: string;
  color: string;
  items: TodoItem[];
  createdAt: string;
  updatedAt: string;
}

/** Créneau horaire (positionnement grille) */
export interface TimeSlot {
  startMinutes: number;
  endMinutes: number;
  dayKey: string;
}

/** Lien événement → nœud workflow (EventLink) */
export interface EventLink {
  workflowId: string | null;
  nodeId: string | null;
}

/** Événement de planification calendrier */
export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  /** ISO start */
  start: string;
  /** ISO end */
  end: string;
  /** Alias contrat startDate / endDate */
  startDate?: string;
  endDate?: string;
  allDay: boolean;
  isAllDay?: boolean;
  color: string;
  linkedTaskId: string | null;
  linkedNoteId: string | null;
  /** Association Moteur Nodal */
  linkedNodeId: string | null;
  linkedWorkflowId: string | null;
  /** true si le trigger calendrier a déjà été tiré pour ce start */
  triggerFiredAt: string | null;
  createdAt: string;
  updatedAt?: string;
}

export type CalendarViewMode = 'month' | 'week' | 'day' | 'planning';

/** Plage temporelle normalisée [start, end] */
export interface TimeRange {
  start: string; // ISO
  end: string; // ISO
}

/**
 * Activité planifiée multi-jours (peut chevaucher d'autres activités)
 * Réserve éventuellement un Workflow de façon exclusive sur la période.
 *
 * Exemple chevauchement :
 *   A: 5→9  et  B: 8→10  → Overlap = true
 *   Workflow de A indisponible pour B sur [8,10]
 */
export interface Activity {
  id: string;
  title: string;
  description: string;
  /** ISO start (inclus) */
  startDate: string;
  /** ISO end (inclus) */
  endDate: string;
  allDay: boolean;
  color: string;
  /** Workflow réservé exclusivement sur cette période (null = libre) */
  workflowId: string | null;
  /** Événement calendrier miroir optionnel */
  linkedEventId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Disponibilité d'un workflow pour une plage temporelle */
export interface WorkflowAvailability {
  workflowId: string;
  title: string;
  color: string;
  isAvailable: boolean;
  /** Ex: "Réservé du 05 au 09" */
  reason?: string;
  /** Libellé UI pour option disabled */
  disabledLabel?: string;
  conflictingActivityId?: string;
  conflictingActivityTitle?: string;
  reservedFrom?: string;
  reservedTo?: string;
}

/** Layout piste parallèle pour chevauchements (stacked rows) */
export interface ActivityLaneLayout {
  activityId: string;
  lane: number;
  laneCount: number;
  /** % left dans la grille planning */
  leftPct: number;
  widthPct: number;
  /** Jours couverts dans la fenêtre visible */
  daySpan?: number;
}

// ─── Brain Dump / Capture Unit ───────────────────────────

export type CaptureStatus =
  | 'raw'
  | 'processed'
  | 'routed'
  | 'converted'
  | 'discarded'
  | 'archived';

export type ConversionTarget = 'workflow' | 'note' | 'task' | 'event';
export type CaptureRoute = ConversionTarget | null;
export type CapturePriority = 'none' | 'low' | 'medium' | 'high' | 'critical';

export interface BrainDumpItem {
  id: string;
  content: string;
  plainText: string;
  status: CaptureStatus;
  route: CaptureRoute;
  routedToId: string | null;
  tags: string[];
  priority: CapturePriority;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
  source: 'inbox' | 'quick-capture' | 'import';
}

export type CaptureUnit = BrainDumpItem;

export interface ConversionPayload {
  title?: string;
  workflowId?: string;
  start?: string;
  end?: string;
  priority?: TaskPriority;
  folderId?: string | null;
  removeFromInbox?: boolean;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'error' | 'warning';
  title: string;
  description?: string;
  duration?: number;
}

/** Thèmes FlowMind (Mode Sombre Avancé) */
export type ThemeId = 'dark-neutral' | 'dark-oled' | 'light' | 'system';

export interface ThemeConfig {
  id: ThemeId;
  label: string;
  description: string;
  /** Couleur surface racine (preview) */
  preview: string;
  isDark: boolean;
}

export const THEME_PRESETS: ThemeConfig[] = [
  {
    id: 'dark-neutral',
    label: 'Sombre Neutre',
    description: 'Zinc profond — confort longue session',
    preview: '#07080c',
    isDark: true,
  },
  {
    id: 'dark-oled',
    label: 'OLED Pitch Black',
    description: 'Noir pur #000 — économie batterie',
    preview: '#000000',
    isDark: true,
  },
  {
    id: 'light',
    label: 'Clair',
    description: 'Surfaces claires, accents indigo',
    preview: '#f4f4f5',
    isDark: false,
  },
  {
    id: 'system',
    label: 'Système',
    description: 'Suit les préférences OS',
    preview: 'linear-gradient(135deg,#07080c 50%,#f4f4f5 50%)',
    isDark: true,
  },
];

/** Schéma de sauvegarde JSON (Backup) */
export interface BackupSchema {
  format: 'flowmind-backup';
  version: number;
  exportedAt: string;
  appVersion: string;
  checksum?: string;
  state: AppState;
}

export interface TouchEventPayload {
  kind: 'swipe' | 'pinch' | 'longpress' | 'tap';
  direction?: 'left' | 'right' | 'up' | 'down';
  velocity?: number;
  scale?: number;
  x?: number;
  y?: number;
}

/** Préférences UI globales */
export interface UIPreferences {
  sidebarCollapsed: boolean;
  /** @deprecated utiliser themeId */
  theme: 'dark' | 'light';
  themeId: ThemeId;
  activeZone: ZoneId;
  density: 'comfortable' | 'compact';
  removeCaptureOnConvert: boolean;
  quickCaptureOpen: boolean;
  /** Workflow actuellement édité sur le canvas */
  activeWorkflowId: string | null;
  /** Nœud ouvert dans l'Inspecteur latéral */
  selectedNodeId: string | null;
  /** Inspecteur latéral ouvert */
  inspectorOpen: boolean;
  /** Filtre d'état d'exécution sur le canvas */
  executionFilter: ExecutionState | 'all';
  /** Note active dans Notes Dek */
  activeNoteId: string | null;
  /** Mode focus plein écran Notes */
  notesFocusMode: boolean;
  /** Vue calendrier active */
  calendarViewMode: CalendarViewMode;
  /** Réduire les animations (accessibilité) */
  reduceMotion: boolean;
  /** Settings panel ouvert */
  settingsOpen: boolean;
  /** Haptics / feedback micro */
  microFeedback: boolean;
}

/** État global normalisé de l'application */
export interface AppState {
  version: number;
  ui: UIPreferences;
  workflows: Workflow[];
  notes: Note[];
  folders: NoteFolder[];
  tasks: Task[];
  /** Listes d'Unités d'Action multi-projets */
  todoLists: TodoList[];
  events: CalendarEvent[];
  /** Activités multi-jours avec réservation workflow */
  activities: Activity[];
  captures: BrainDumpItem[];
  lastSavedAt: string | null;
}

/** Événements du bus applicatif */
export const AppEvents = {
  ZONE_CHANGED: 'ZONE_CHANGED',
  STATE_UPDATED: 'STATE_UPDATED',
  DATA_SAVED: 'DATA_SAVED',
  DATA_LOADED: 'DATA_LOADED',
  SIDEBAR_TOGGLED: 'SIDEBAR_TOGGLED',
  WORKFLOW_UPDATED: 'WORKFLOW_UPDATED',
  NOTE_UPDATED: 'NOTE_UPDATED',
  NOTE_CREATED: 'NOTE_CREATED',
  NOTE_DELETED: 'NOTE_DELETED',
  TASK_UPDATED: 'TASK_UPDATED',
  TODO_LIST_CREATED: 'TODO_LIST_CREATED',
  TODO_LIST_UPDATED: 'TODO_LIST_UPDATED',
  TODO_LIST_DELETED: 'TODO_LIST_DELETED',
  TODO_ITEM_TOGGLED: 'TODO_ITEM_TOGGLED',
  TODO_ITEM_ADDED: 'TODO_ITEM_ADDED',
  EVENT_UPDATED: 'EVENT_UPDATED',
  CALENDAR_EVENT_SAVED: 'CALENDAR_EVENT_SAVED',
  CALENDAR_EVENT_DELETED: 'CALENDAR_EVENT_DELETED',
  ACTIVITY_SAVED: 'ACTIVITY_SAVED',
  ACTIVITY_DELETED: 'ACTIVITY_DELETED',
  TRIGGER_ACTIVATED: 'TRIGGER_ACTIVATED',

  // Capture / Brain Dump
  CAPTURE_ADDED: 'CAPTURE_ADDED',
  CAPTURE_UPDATED: 'CAPTURE_UPDATED',
  CAPTURE_REMOVED: 'CAPTURE_REMOVED',
  CAPTURE_PROCESSED: 'CAPTURE_PROCESSED',
  BRAIN_DUMP_ITEM_CONVERTED: 'BRAIN_DUMP_ITEM_CONVERTED',

  // Demandes de création
  CREATE_NODE_REQUESTED: 'CREATE_NODE_REQUESTED',
  CREATE_NOTE_REQUESTED: 'CREATE_NOTE_REQUESTED',
  CREATE_TASK_REQUESTED: 'CREATE_TASK_REQUESTED',
  CREATE_EVENT_REQUESTED: 'CREATE_EVENT_REQUESTED',
  CREATE_CONNECTION_REQUESTED: 'CREATE_CONNECTION_REQUESTED',
  CREATE_WORKFLOW_REQUESTED: 'CREATE_WORKFLOW_REQUESTED',

  // Entités créées / mutées
  NODE_CREATED: 'NODE_CREATED',
  NODE_MOVED: 'NODE_MOVED',
  NODE_UPDATED: 'NODE_UPDATED',
  NODE_DELETED: 'NODE_DELETED',
  NODE_SELECTED: 'NODE_SELECTED',
  NODE_DESELECTED: 'NODE_DESELECTED',
  SUBTASK_ADDED: 'SUBTASK_ADDED',
  SUBTASK_UPDATED: 'SUBTASK_UPDATED',
  SUBTASK_REMOVED: 'SUBTASK_REMOVED',
  SUBTASK_REORDERED: 'SUBTASK_REORDERED',
  RECURRENCE_CONFIGURED: 'RECURRENCE_CONFIGURED',
  RECURRENCE_TRIGGERED: 'RECURRENCE_TRIGGERED',
  INSPECTOR_OPENED: 'INSPECTOR_OPENED',
  INSPECTOR_CLOSED: 'INSPECTOR_CLOSED',
  CONNECTION_CREATED: 'CONNECTION_CREATED',
  CONNECTION_DELETED: 'CONNECTION_DELETED',
  WORKFLOW_CREATED: 'WORKFLOW_CREATED',
  WORKFLOW_DELETED: 'WORKFLOW_DELETED',
  WORKFLOW_RENAMED: 'WORKFLOW_RENAMED',
  WORKFLOW_SELECTED: 'WORKFLOW_SELECTED',
  TASK_CREATED: 'TASK_CREATED',
  EVENT_CREATED: 'EVENT_CREATED',

  // Exécution & triggers
  EXECUTION_STARTED: 'EXECUTION_STARTED',
  EXECUTION_COMPLETED: 'EXECUTION_COMPLETED',
  EXECUTION_RESET: 'EXECUTION_RESET',
  NODE_STATE_CHANGED: 'NODE_STATE_CHANGED',
  NODE_PROPAGATED: 'NODE_PROPAGATED',
  FLOW_PULSE: 'FLOW_PULSE',
  TRIGGER_FIRED: 'TRIGGER_FIRED',
  TRIGGER_REGISTERED: 'TRIGGER_REGISTERED',

  // Cross-feature / conversions universelles
  CROSS_FEATURE_TRANSFORM: 'CROSS_FEATURE_TRANSFORM',
  ENTITY_CONVERTED: 'ENTITY_CONVERTED',
  DRAG_STARTED: 'DRAG_STARTED',
  DRAG_ENDED: 'DRAG_ENDED',
  DROP_COMPLETED: 'DROP_COMPLETED',

  // Backup / thème / feedback
  SYSTEM_RESTORED: 'SYSTEM_RESTORED',
  SYSTEM_EXPORTED: 'SYSTEM_EXPORTED',
  THEME_CHANGED: 'THEME_CHANGED',
  MICRO_FEEDBACK: 'MICRO_FEEDBACK',
  TOUCH_GESTURE: 'TOUCH_GESTURE',
  SETTINGS_OPENED: 'SETTINGS_OPENED',
  SETTINGS_CLOSED: 'SETTINGS_CLOSED',

  // UI globale
  QUICK_CAPTURE_OPEN: 'QUICK_CAPTURE_OPEN',
  QUICK_CAPTURE_CLOSE: 'QUICK_CAPTURE_CLOSE',
  TOAST_SHOW: 'TOAST_SHOW',
  TOAST_DISMISS: 'TOAST_DISMISS',

  ERROR: 'ERROR',
} as const;

export type AppEventName = (typeof AppEvents)[keyof typeof AppEvents];

export interface ZoneChangedPayload {
  zone: ZoneId;
  previous: ZoneId;
}

export interface StateUpdatedPayload {
  path?: string;
  state: AppState;
}

export interface DataSavedPayload {
  at: string;
  size: number;
}

export interface BrainDumpConvertedPayload {
  itemId: string;
  targetType: ConversionTarget;
  createdId: string;
  item: BrainDumpItem;
}

export const CONVERSION_LABELS: Record<ConversionTarget, string> = {
  workflow: 'Nœud de Workflow',
  note: 'Note Dek',
  task: "Unité d'Action",
  event: 'Événement planifié',
};

// ─── Cross-Feature Drag & Drop ───────────────────────────

/** Types MIME / DataTransfer standardisés FlowMind */
export const DRAG_TYPES = {
  NOTE: 'application/flowmind-note',
  TODO_ITEM: 'application/flowmind-todo',
  TODO_LIST: 'application/flowmind-todolist',
  BRAIN_DUMP: 'application/flowmind-braindump',
  CALENDAR_EVENT: 'application/flowmind-event',
  WORKFLOW_NODE: 'application/flowmind-node',
  /** Fallback JSON générique */
  UNIVERSAL: 'application/flowmind-universal',
} as const;

export type DragMimeType = (typeof DRAG_TYPES)[keyof typeof DRAG_TYPES];

/** Entités source/cible du convertisseur universel */
export type UniversalEntityType =
  | 'note'
  | 'todo_item'
  | 'todo_list'
  | 'brain_dump'
  | 'calendar_event'
  | 'workflow_node';

/** Module / zone de drop cible */
export type DropTargetModule =
  | 'workflows'
  | 'notes'
  | 'todos'
  | 'calendar'
  | 'braindump';

/** Payload sérialisé dans dataTransfer */
export interface UniversalPayload {
  version: 1;
  sourceType: UniversalEntityType;
  sourceModule: DropTargetModule | string;
  sourceId: string;
  /** Données dénormalisées pour conversion offline du drop */
  data: Record<string, unknown>;
  label: string;
  draggedAt: string;
}

export interface ConversionExtraConfig {
  workflowId?: string;
  nodeType?: NodeType;
  start?: string;
  end?: string;
  durationMinutes?: number;
  listId?: string;
  folderId?: string | null;
  title?: string;
  /** Si true, ouvre la modale de preview avant commit */
  preview?: boolean;
  removeSource?: boolean;
}

export interface ConversionResult {
  ok: boolean;
  sourceType: UniversalEntityType;
  targetType: UniversalEntityType;
  createdId?: string;
  createdIds?: string[];
  error?: string;
  preview?: Record<string, unknown>;
}

/** Matrice de compatibilité source → cibles */
export const CONVERSION_MATRIX: Record<
  UniversalEntityType,
  UniversalEntityType[]
> = {
  note: ['workflow_node', 'todo_item', 'calendar_event', 'brain_dump'],
  todo_item: ['calendar_event', 'note', 'workflow_node', 'brain_dump'],
  todo_list: ['note', 'workflow_node'],
  brain_dump: ['note', 'todo_item', 'workflow_node', 'calendar_event'],
  calendar_event: ['note', 'todo_item', 'workflow_node', 'brain_dump'],
  workflow_node: ['note', 'todo_item', 'calendar_event', 'brain_dump'],
};

/** Mapping zone → type d'entité principal créé au drop */
export const ZONE_PRIMARY_TARGET: Record<DropTargetModule, UniversalEntityType> =
  {
    workflows: 'workflow_node',
    notes: 'note',
    todos: 'todo_item',
    calendar: 'calendar_event',
    braindump: 'brain_dump',
  };

export const ENTITY_LABELS: Record<UniversalEntityType, string> = {
  note: 'Note Dek',
  todo_item: "Unité d'Action",
  todo_list: "Liste d'Actions",
  brain_dump: 'Capture Unit',
  calendar_event: 'Événement',
  workflow_node: 'Nœud de Workflow',
};

export const MIME_TO_ENTITY: Record<string, UniversalEntityType> = {
  [DRAG_TYPES.NOTE]: 'note',
  [DRAG_TYPES.TODO_ITEM]: 'todo_item',
  [DRAG_TYPES.TODO_LIST]: 'todo_list',
  [DRAG_TYPES.BRAIN_DUMP]: 'brain_dump',
  [DRAG_TYPES.CALENDAR_EVENT]: 'calendar_event',
  [DRAG_TYPES.WORKFLOW_NODE]: 'workflow_node',
};

export const ENTITY_TO_MIME: Record<UniversalEntityType, string> = {
  note: DRAG_TYPES.NOTE,
  todo_item: DRAG_TYPES.TODO_ITEM,
  todo_list: DRAG_TYPES.TODO_LIST,
  brain_dump: DRAG_TYPES.BRAIN_DUMP,
  calendar_event: DRAG_TYPES.CALENDAR_EVENT,
  workflow_node: DRAG_TYPES.WORKFLOW_NODE,
};
