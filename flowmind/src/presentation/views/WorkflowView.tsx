/**
 * Zone 1 — Dashboard & Workflows Nodaux (style n8n)
 * Canvas interactif multi-workflows — MILMA Sous-Prompt 3
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GitBranch,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Zap,
  Play,
  RefreshCw,
  Target,
  GitFork,
  Circle,
  StickyNote,
  MoreHorizontal,
  RotateCcw,
  Download,
  Upload,
  FileJson,
  LogOut,
  UserCheck,
} from 'lucide-react';
import { useAppState } from '../../hooks/useStateStore';
import { useAuth } from '../context/AuthContext';
import ProtectedRoute from '../components/auth/ProtectedRoute';
import { WorkflowEngine } from '../../core/WorkflowEngine';
import { ExecutionEngine } from '../../core/ExecutionEngine';
import { TriggerService } from '../../core/TriggerService';
import { BackupService } from '../../core/BackupService';
import { StateStore } from '../../core/StateStore';
import {
  EXECUTION_STATE_META,
  NODE_TYPE_META,
  type CanvasViewport,
  type ExecutionState,
  type NodeType,
  type Workflow,
} from '../../core/Types';
import WorkflowCanvas, { ZoomControls } from '../modules/canvas/WorkflowCanvas';
import {
  DEFAULT_VIEWPORT,
  centerOn,
  clampZoom,
  zoomAtPoint,
} from '../modules/canvas/CanvasController';
import { NODE_HEIGHT, NODE_WIDTH } from '../../core/Types';
import NodeInspector from '../modules/inspector/NodeInspector';
import { SubtaskManager } from '../../core/SubtaskManager';
import { getExecutionState } from '../modules/canvas/NodeRenderer';

const ADD_TYPES: { type: NodeType; icon: React.ReactNode }[] = [
  { type: 'trigger', icon: <Zap className="w-3.5 h-3.5" /> },
  { type: 'action', icon: <Play className="w-3.5 h-3.5" /> },
  { type: 'routine', icon: <RefreshCw className="w-3.5 h-3.5" /> },
  { type: 'goal', icon: <Target className="w-3.5 h-3.5" /> },
  { type: 'condition', icon: <GitFork className="w-3.5 h-3.5" /> },
  { type: 'output', icon: <Circle className="w-3.5 h-3.5" /> },
  { type: 'note', icon: <StickyNote className="w-3.5 h-3.5" /> },
];

function WorkflowTabs({
  workflows,
  activeId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  workflows: Workflow[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.focus();
  }, [editingId]);

  return (
    <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto">
      {workflows.map((wf) => {
        const active = wf.id === activeId;
        const editing = editingId === wf.id;
        return (
          <div
            key={wf.id}
            className={`group relative flex items-center gap-1.5 shrink-0 rounded-lg border transition-colors ${
              active
                ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(wf.id)}
              onDoubleClick={() => {
                setEditingId(wf.id);
                setDraft(wf.title);
              }}
              className="flex items-center gap-1.5 pl-2.5 pr-1 py-1.5 text-xs font-medium max-w-[160px]"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: wf.color }}
              />
              {editing ? (
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onRename(wf.id, draft);
                      setEditingId(null);
                    }
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onBlur={() => {
                    if (draft.trim()) onRename(wf.id, draft);
                    setEditingId(null);
                  }}
                  className="bg-transparent outline-none w-28 text-xs text-zinc-100"
                />
              ) : (
                <span className="truncate">{wf.title}</span>
              )}
            </button>
            <div className="relative pr-1">
              <button
                type="button"
                className="p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-white/[0.06]"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(menuId === wf.id ? null : wf.id);
                }}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
              {menuId === wf.id && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-30 cursor-default"
                    aria-label="Fermer menu"
                    onClick={() => setMenuId(null)}
                  />
                  <div className="absolute right-0 top-full mt-1 z-40 w-36 rounded-lg border border-white/[0.1] bg-[#12141c] shadow-xl py-1">
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.05]"
                      onClick={() => {
                        setMenuId(null);
                        setEditingId(wf.id);
                        setDraft(wf.title);
                      }}
                    >
                      <Pencil className="w-3 h-3" /> Renommer
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
                      onClick={() => {
                        setMenuId(null);
                        onDelete(wf.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" /> Supprimer
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}
      <button
        type="button"
        onClick={onCreate}
        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium
          text-zinc-400 hover:text-indigo-300 border border-dashed border-white/[0.08]
          hover:border-indigo-500/30 hover:bg-indigo-500/10 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Nouveau</span>
      </button>
    </div>
  );
}

/** Menu Exporter / Importer / Supprimer workflow */
function WorkflowFileActions({
  workflowId,
  title,
}: {
  workflowId: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const doDelete = () => {
    WorkflowEngine.deleteWorkflow(workflowId);
    setConfirmDelete(false);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
          text-zinc-400 border border-white/[0.08] hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
        title="Actions fichier"
      >
        <FileJson className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Fichier</span>
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30"
            aria-label="Fermer"
            onClick={() => {
              setOpen(false);
              setConfirmDelete(false);
            }}
          />
          <div className="absolute right-0 top-full mt-1.5 z-40 w-52 rounded-xl border border-white/[0.1] bg-[#12141c]/98 shadow-2xl py-1.5 backdrop-blur-xl">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 truncate">
              {title}
            </p>
            <button
              type="button"
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.05]"
              onClick={() => {
                void BackupService.exportWorkflowJSON(workflowId);
                setOpen(false);
              }}
            >
              <Download className="w-3.5 h-3.5 text-indigo-300" />
              Exporter .flowmind.json
            </button>
            <button
              type="button"
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.05]"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="w-3.5 h-3.5 text-emerald-300" />
              Importer un workflow
            </button>
            <div className="my-1 border-t border-white/[0.06]" />
            {!confirmDelete ? (
              <button
                type="button"
                className="flex items-center gap-2 w-full px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                Supprimer le workflow
              </button>
            ) : (
              <div className="px-3 py-2 space-y-2">
                <p className="text-[10px] text-rose-200/90 leading-relaxed">
                  Supprimer « {title} », nœuds, et détacher activités liées ?
                </p>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={doDelete}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold bg-rose-500/20 text-rose-200 border border-rose-500/30"
                  >
                    Confirmer
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 px-2 py-1.5 rounded-lg text-[10px] text-zinc-400 border border-white/[0.08]"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".json,.flowmind.json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void BackupService.importWorkflowJSON(f);
          setOpen(false);
          if (fileRef.current) fileRef.current.value = '';
        }}
      />
    </div>
  );
}

function AddNodeMenu({
  workflowId,
  viewport,
}: {
  workflowId: string;
  viewport: CanvasViewport;
}) {
  const [open, setOpen] = useState(false);

  const add = (type: NodeType) => {
    // Place near center of current view
    const cx = (typeof window !== 'undefined' ? window.innerWidth * 0.35 : 400) - viewport.x;
    const cy = (typeof window !== 'undefined' ? window.innerHeight * 0.25 : 200) - viewport.y;
    const x = cx / viewport.zoom - NODE_WIDTH / 2 + Math.random() * 40;
    const y = cy / viewport.zoom - NODE_HEIGHT / 2 + Math.random() * 40;
    WorkflowEngine.addNode(workflowId, { type, x, y });
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
          bg-indigo-500/15 text-indigo-300 border border-indigo-500/25
          hover:bg-indigo-500/25 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Ajouter un Nœud
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1.5 z-40 w-48 rounded-xl border border-white/[0.1] bg-[#12141c]/98 shadow-2xl py-1.5 backdrop-blur-xl">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Type de nœud
            </p>
            {ADD_TYPES.map(({ type, icon }) => {
              const meta = NODE_TYPE_META[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => add(type)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-white/[0.05] transition-colors"
                >
                  <span
                    className="flex items-center justify-center w-7 h-7 rounded-lg"
                    style={{
                      color: meta.color,
                      background: meta.bg,
                      border: `1px solid ${meta.ring}`,
                    }}
                  >
                    {icon}
                  </span>
                  <span className="text-xs font-medium text-zinc-200">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function WorkflowView() {
  return (
    <ProtectedRoute>
      <WorkflowViewContent />
    </ProtectedRoute>
  );
}

function WorkflowViewContent() {
  const state = useAppState();
  const { workflows, ui } = state;
  const { user, signOut } = useAuth();
  const activeId = ui.activeWorkflowId;
  const active = useMemo(
    () => workflows.find((w) => w.id === activeId) ?? workflows[0] ?? null,
    [workflows, activeId]
  );

  const [vp, setVp] = useState<CanvasViewport>(DEFAULT_VIEWPORT);
  const canvasHostRef = useRef<HTMLDivElement>(null);

  // Assure un workflow actif
  useEffect(() => {
    if (!activeId && workflows.length > 0) {
      WorkflowEngine.selectWorkflow(workflows[0].id);
    }
  }, [activeId, workflows]);

  useEffect(() => {
    if (active?.viewport) setVp(active.viewport);
    else setVp(DEFAULT_VIEWPORT);
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleZoom = (nextZoom: number) => {
    const el = canvasHostRef.current;
    if (!el) {
      setVp((v) => ({ ...v, zoom: clampZoom(nextZoom) }));
      return;
    }
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const next = zoomAtPoint(vp, cx, cy, rect, nextZoom);
    setVp(next);
    if (active) WorkflowEngine.saveViewport(active.id, next);
  };

  const handleFit = () => {
    if (!active || active.nodes.length === 0 || !canvasHostRef.current) {
      handleZoom(1);
      return;
    }
    const rect = canvasHostRef.current.getBoundingClientRect();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    active.nodes.forEach((n) => {
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + NODE_WIDTH);
      maxY = Math.max(maxY, n.y + NODE_HEIGHT);
    });
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const pad = 80;
    const scaleX = (rect.width - pad) / Math.max(maxX - minX, 200);
    const scaleY = (rect.height - pad) / Math.max(maxY - minY, 200);
    const zoom = clampZoom(Math.min(scaleX, scaleY, 1.2));
    const next = centerOn(cx, cy, rect.width, rect.height, zoom);
    setVp(next);
    WorkflowEngine.saveViewport(active.id, next);
  };

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Toolbar workflows */}
      <div className="flex items-center gap-3 px-3 lg:px-4 py-2.5 border-b border-white/[0.06] bg-[#0a0b10]/60">
        <div className="hidden sm:flex items-center gap-1.5 text-zinc-600 shrink-0">
          <GitBranch className="w-3.5 h-3.5" />
        </div>

        <WorkflowTabs
          workflows={workflows}
          activeId={active?.id ?? null}
          onSelect={(id) => WorkflowEngine.selectWorkflow(id)}
          onCreate={() => WorkflowEngine.createWorkflow()}
          onRename={(id, t) => WorkflowEngine.renameWorkflow(id, t)}
          onDelete={(id) => {
            if (
              confirm(
                'Supprimer ce Workflow Nodal, tous ses nœuds, et détacher les activités/événements liés ?'
              )
            ) {
              WorkflowEngine.deleteWorkflow(id);
            }
          }}
        />

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          {active && (
            <>
              <ZoomControls zoom={vp.zoom} onZoom={handleZoom} onFit={handleFit} />
              <AddNodeMenu workflowId={active.id} viewport={vp} />
              <WorkflowFileActions workflowId={active.id} title={active.title} />
            </>
          )}
          {!active && (
            <button
              type="button"
              onClick={() => WorkflowEngine.createWorkflow()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                bg-indigo-500/15 text-indigo-300 border border-indigo-500/25
                hover:bg-indigo-500/25 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Nouveau Workflow
            </button>
          )}

          {user && (
            <div className="flex items-center gap-1.5 border-l border-white/[0.08] pl-3 ml-1 text-xs text-zinc-500 shrink-0">
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden lg:inline text-zinc-400 font-medium truncate max-w-[100px]">{user.displayName || user.email}</span>
              <button
                type="button"
                onClick={() => signOut()}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                title="Se déconnecter"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Stats + exécution */}
      {active && (
        <div className="flex flex-wrap items-center gap-2 px-3 lg:px-4 py-1.5 border-b border-white/[0.04] text-[10px] text-zinc-600">
          <span className="font-medium text-zinc-500">{active.title}</span>
          <span className="opacity-40">·</span>
          <span className="tabular-nums">{active.nodes.length} nœuds</span>
          <span className="opacity-40">·</span>
          <span className="tabular-nums">{active.edges.length} liaisons</span>
          {active.runStatus && active.runStatus !== 'idle' && (
            <>
              <span className="opacity-40">·</span>
              <span
                className={`font-semibold uppercase tracking-wide ${
                  active.runStatus === 'running'
                    ? 'text-orange-400'
                    : active.runStatus === 'completed'
                      ? 'text-emerald-400'
                      : active.runStatus === 'failed'
                        ? 'text-rose-400'
                        : 'text-zinc-500'
                }`}
              >
                {active.runStatus}
              </span>
            </>
          )}

          <div className="flex items-center gap-1 ml-auto flex-wrap">
            {/* Filtre d'état */}
            <div className="hidden md:flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.02] border border-white/[0.06] mr-1">
              {(
                [
                  'all',
                  'ready',
                  'in_progress',
                  'completed',
                  'locked',
                ] as const
              ).map((f) => {
                const activeF = (ui.executionFilter ?? 'all') === f;
                const label =
                  f === 'all'
                    ? 'Tous'
                    : EXECUTION_STATE_META[f as ExecutionState]?.label ?? f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() =>
                      StateStore.updateUI({ executionFilter: f })
                    }
                    className={`px-1.5 py-1 rounded-md text-[9px] font-medium transition-colors ${
                      activeF
                        ? 'bg-white/[0.08] text-zinc-200'
                        : 'text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => ExecutionEngine.triggerWorkflow(active.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold
                bg-emerald-500/15 text-emerald-300 border border-emerald-500/30
                hover:bg-emerald-500/25 transition-colors"
              title="Exécuter le workflow (triggers)"
            >
              <Play className="w-3 h-3" fill="currentColor" />
              Exécuter
            </button>
            <button
              type="button"
              onClick={() => {
                const triggers = active.nodes.filter((n) => n.type === 'trigger');
                if (triggers[0]) TriggerService.fireManual(active.id, triggers[0].id);
                else ExecutionEngine.triggerWorkflow(active.id);
              }}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium
                text-sky-300 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 transition-colors"
              title="Trigger manuel"
            >
              <Zap className="w-3 h-3" />
              <span className="hidden sm:inline">Trigger</span>
            </button>
            <button
              type="button"
              onClick={() => ExecutionEngine.resetWorkflowExecution(active.id)}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium
                text-zinc-400 hover:text-zinc-200 border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
              title="Réinitialiser l'exécution"
            >
              <RotateCcw className="w-3 h-3" />
              <span className="hidden sm:inline">Reset</span>
            </button>
          </div>

          {/* Mini compteurs d'états */}
          <div className="w-full flex items-center gap-2 pt-0.5 md:w-auto md:pt-0 md:ml-0">
            {(['locked', 'ready', 'in_progress', 'completed'] as ExecutionState[]).map(
              (s) => {
                const count = active.nodes.filter((n) => getExecutionState(n) === s).length;
                if (!count) return null;
                const m = EXECUTION_STATE_META[s];
                return (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 text-[9px] font-medium"
                    style={{ color: m.color }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: m.color }}
                    />
                    {count}
                  </span>
                );
              }
            )}
          </div>
        </div>
      )}

      {/* Canvas + Inspecteur latéral */}
      <div ref={canvasHostRef} className="flex-1 min-h-0 relative flex flex-col">
        {active ? (
          <>
            <WorkflowCanvas
              key={active.id}
              workflow={active}
              viewport={vp}
              onViewportChange={setVp}
            />
            <NodeInspector />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center relative">
            <div
              className="absolute inset-0 opacity-30 pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(circle, rgba(148,163,184,0.15) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }}
            />
            <div className="relative z-10 max-w-md">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-5">
                <GitBranch className="w-7 h-7 text-indigo-400" />
              </div>
              <h2 className="text-lg font-semibold text-zinc-100 mb-2">Workflows Nodaux</h2>
              <p className="text-sm text-zinc-500 leading-relaxed mb-6">
                Créez votre premier espace de travail nodal. Connectez triggers, actions, routines et
                goals — inspectez chaque nœud, sous-tâches et récurrences.
              </p>
              <button
                type="button"
                onClick={() => {
                  const wf = WorkflowEngine.createWorkflow('Mon premier flux');
                  const t = WorkflowEngine.addNode(wf.id, {
                    type: 'trigger',
                    label: 'Début de journée',
                    x: 80,
                    y: 140,
                  });
                  const a = WorkflowEngine.addNode(wf.id, {
                    type: 'action',
                    label: 'Revue des captures',
                    x: 360,
                    y: 140,
                  });
                  const r = WorkflowEngine.addNode(wf.id, {
                    type: 'routine',
                    label: 'Routine matin',
                    x: 360,
                    y: 280,
                  });
                  const g = WorkflowEngine.addNode(wf.id, {
                    type: 'goal',
                    label: 'Focus profond',
                    x: 640,
                    y: 140,
                  });
                  if (t && a) WorkflowEngine.connectNodes(wf.id, t.id, a.id);
                  if (a && g) WorkflowEngine.connectNodes(wf.id, a.id, g.id);
                  if (a && r) WorkflowEngine.connectNodes(wf.id, a.id, r.id);
                  // Seed sous-tâches sur la routine
                  if (r) {
                    SubtaskManager.add(wf.id, r.id, 'Hydratation');
                    SubtaskManager.add(wf.id, r.id, 'Planifier 3 priorités');
                    SubtaskManager.add(wf.id, r.id, 'Inbox zero (5 min)');
                  }
                  if (a) {
                    SubtaskManager.add(wf.id, a.id, 'Trier Brain Dump');
                    SubtaskManager.add(wf.id, a.id, 'Convertir 2 captures');
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                  bg-indigo-500 text-white hover:bg-indigo-400 shadow-lg shadow-indigo-500/25 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Créer un Workflow
              </button>
              <div className="mt-4 flex items-center justify-center gap-2 text-[11px] text-zinc-600">
                <Check className="w-3 h-3 text-emerald-500" />
                Inspecteur · Sous-tâches · Récurrence
                <X className="w-3 h-3 opacity-0" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
