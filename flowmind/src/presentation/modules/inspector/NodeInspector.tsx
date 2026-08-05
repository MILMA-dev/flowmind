/**
 * NodeInspector — Panneau latéral d'inspection (Drawer droit)
 * Métadonnées, sous-tâches, récurrence
 * Équipe MILMA — NodeInspectorController (UI)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  X,
  Plus,
  Trash2,
  GripVertical,
  Check,
  Flag,
  Calendar,
  ListChecks,
  AlignLeft,
} from 'lucide-react';
import { useAppState } from '../../../hooks/useStateStore';
import { StateStore } from '../../../core/StateStore';
import { WorkflowEngine } from '../../../core/WorkflowEngine';
import { ExecutionEngine } from '../../../core/ExecutionEngine';
// setExecutionStrategy via WorkflowEngine
import { TriggerService } from '../../../core/TriggerService';
import { SubtaskManager } from '../../../core/SubtaskManager';
import { RecurrenceEngine } from '../../../core/RecurrenceEngine';
import {
  NODE_TYPE_META,
  type ExecutionStrategy,
  type JoinMode,
  type NodePriority,
  type NodeStatus,
  type NodeType,
  type TriggerKind,
  type WorkflowNode,
  joinModeToStrategy,
} from '../../../core/Types';
import RecurrenceConfigurator from './RecurrenceConfigurator';
import { ExecutionBadge, getExecutionState } from '../canvas/NodeRenderer';
import { Play, CheckCircle2, SkipForward, Ban } from 'lucide-react';

const PRIORITIES: { id: NodePriority; label: string; color: string }[] = [
  { id: 'low', label: 'Faible', color: 'text-zinc-400' },
  { id: 'medium', label: 'Moyenne', color: 'text-sky-400' },
  { id: 'high', label: 'Haute', color: 'text-orange-400' },
  { id: 'critical', label: 'Critique', color: 'text-rose-400' },
];

const STATUSES: { id: NodeStatus; label: string }[] = [
  { id: 'locked', label: 'Verrouillé' },
  { id: 'ready', label: 'Prêt' },
  { id: 'in_progress', label: 'En cours' },
  { id: 'completed', label: 'Terminé' },
  { id: 'failed', label: 'Échoué' },
  { id: 'skipped', label: 'Ignoré' },
];

const TYPES: NodeType[] = [
  'trigger',
  'action',
  'routine',
  'goal',
  'condition',
  'output',
  'note',
];

function dueInputValue(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SubtaskList({
  workflowId,
  node,
}: {
  workflowId: string;
  node: WorkflowNode;
}) {
  const [draft, setDraft] = useState('');
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () => [...node.subtasks].sort((a, b) => a.order - b.order),
    [node.subtasks]
  );

  const done = sorted.filter((s) => s.done).length;
  const total = sorted.length;
  const pct = node.progress ?? 0;

  const add = () => {
    const t = draft.trim();
    SubtaskManager.add(workflowId, node.id, t || undefined);
    setDraft('');
    inputRef.current?.focus();
  };

  return (
    <section className="fm-inspector-section">
      <header className="flex items-center gap-2 mb-2">
        <ListChecks className="w-3.5 h-3.5 text-zinc-500" />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Sous-tâches
        </h3>
        <span className="ml-auto text-[10px] tabular-nums text-zinc-500">
          {done}/{total}
        </span>
      </header>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="mt-1 text-[10px] text-zinc-600 tabular-nums">{pct}% complété</p>
      </div>

      <ul className="space-y-1 mb-2">
        {sorted.map((s, index) => (
          <li
            key={s.id}
            draggable
            onDragStart={() => setDragFrom(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragFrom == null || dragFrom === index) return;
              SubtaskManager.reorder(workflowId, node.id, dragFrom, index);
              setDragFrom(null);
            }}
            onDragEnd={() => setDragFrom(null)}
            className={`group flex items-center gap-1.5 rounded-lg border px-1.5 py-1 transition-colors ${
              s.done
                ? 'border-white/[0.04] bg-white/[0.015] opacity-70'
                : 'border-white/[0.06] bg-white/[0.025] hover:border-white/[0.1]'
            } ${dragFrom === index ? 'opacity-50' : ''}`}
          >
            <span className="cursor-grab text-zinc-600 hover:text-zinc-400 p-0.5 touch-none">
              <GripVertical className="w-3.5 h-3.5" />
            </span>
            <button
              type="button"
              onClick={() => SubtaskManager.toggle(workflowId, node.id, s.id)}
              className={`shrink-0 w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-colors ${
                s.done
                  ? 'bg-indigo-500 border-indigo-400 text-white'
                  : 'border-white/20 hover:border-indigo-400/60'
              }`}
              aria-label={s.done ? 'Décocher' : 'Cocher'}
            >
              {s.done && <Check className="w-3 h-3" strokeWidth={3} />}
            </button>
            <input
              value={s.title}
              onChange={(e) =>
                SubtaskManager.updateTitle(workflowId, node.id, s.id, e.target.value)
              }
              className={`flex-1 min-w-0 bg-transparent text-xs outline-none py-1 ${
                s.done ? 'text-zinc-500 line-through' : 'text-zinc-200'
              }`}
            />
            <button
              type="button"
              onClick={() => SubtaskManager.remove(workflowId, node.id, s.id)}
              className="p-1 rounded-md text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-rose-300 hover:bg-rose-500/10 transition-all"
              aria-label="Supprimer"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>

      {sorted.length === 0 && (
        <p className="text-[11px] text-zinc-600 mb-2 px-0.5">
          Aucune sous-tâche — découpez ce nœud en actions élémentaires.
        </p>
      )}

      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Ajouter une sous-tâche…"
          className="flex-1 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-indigo-500/40"
        />
        <button
          type="button"
          onClick={add}
          className="p-2 rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 hover:bg-indigo-500/25 transition-colors"
          title="Ajouter"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </section>
  );
}

export default function NodeInspector() {
  const state = useAppState();
  const { ui, workflows } = state;
  const open = ui.inspectorOpen && !!ui.selectedNodeId;
  const workflowId = ui.activeWorkflowId;

  const ctx = useMemo(() => {
    if (!workflowId || !ui.selectedNodeId) return null;
    const wf = workflows.find((w) => w.id === workflowId);
    const node = wf?.nodes.find((n) => n.id === ui.selectedNodeId);
    if (!wf || !node) return null;
    return { wf, node };
  }, [workflows, workflowId, ui.selectedNodeId]);

  // Ferme si nœud disparu
  useEffect(() => {
    if (open && !ctx) StateStore.closeInspector();
  }, [open, ctx]);

  // Échap ferme l'inspecteur
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        const t = e.target as HTMLElement;
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') {
          (t as HTMLElement).blur();
          return;
        }
        StateStore.closeInspector();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const patch = (partial: Partial<WorkflowNode>) => {
    if (!ctx) return;
    // Sync status ↔ executionState
    if (partial.status && !partial.executionState) {
      partial = { ...partial, executionState: partial.status };
    }
    if (partial.executionState && !partial.status) {
      partial = { ...partial, status: partial.executionState };
    }
    WorkflowEngine.updateNode(ctx.wf.id, ctx.node.id, partial);
  };

  const meta = ctx ? NODE_TYPE_META[ctx.node.type] : null;
  const exec = ctx ? getExecutionState(ctx.node) : 'locked';

  return (
    <AnimatePresence>
      {open && ctx && meta && (
        <motion.aside
          key={ctx.node.id}
          initial={{ x: '100%', opacity: 0.6 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0.4 }}
          transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          className="fm-inspector absolute top-0 right-0 bottom-0 z-30 flex flex-col
            w-[min(100%,360px)] border-l border-white/[0.08]
            bg-[#0b0c12]/96 backdrop-blur-xl shadow-2xl shadow-black/50"
          data-inspector
        >
          {/* Header */}
          <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-white/[0.06]">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
              style={{
                background: meta.bg,
                color: meta.color,
                border: `1px solid ${meta.ring}`,
              }}
            >
              {meta.label.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-1">
                Inspecteur de Nœud
              </p>
              <input
                value={ctx.node.label}
                onChange={(e) => patch({ label: e.target.value })}
                className="w-full bg-transparent text-base font-semibold text-zinc-100 outline-none border-b border-transparent focus:border-white/15 pb-0.5"
              />
            </div>
            <button
              type="button"
              onClick={() => StateStore.closeInspector()}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
              aria-label="Fermer l'inspecteur"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body scroll */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            {/* Exécution rapide */}
            <section className="fm-inspector-section">
              <div className="flex items-center gap-2 mb-2">
                <ExecutionBadge state={exec} />
                <span className="text-[10px] text-zinc-600">Machine à états</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => ExecutionEngine.startNode(ctx.wf.id, ctx.node.id)}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium
                    text-sky-300 bg-sky-500/10 border border-sky-500/25 hover:bg-sky-500/20"
                >
                  <Play className="w-3 h-3" /> Démarrer
                </button>
                <button
                  type="button"
                  onClick={() => ExecutionEngine.completeNode(ctx.wf.id, ctx.node.id)}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium
                    text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20"
                >
                  <CheckCircle2 className="w-3 h-3" /> Terminer
                </button>
                <button
                  type="button"
                  onClick={() => ExecutionEngine.skipNode(ctx.wf.id, ctx.node.id)}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium
                    text-violet-300 bg-violet-500/10 border border-violet-500/25 hover:bg-violet-500/20"
                >
                  <SkipForward className="w-3 h-3" /> Ignorer
                </button>
                <button
                  type="button"
                  onClick={() => ExecutionEngine.failNode(ctx.wf.id, ctx.node.id)}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium
                    text-rose-300 bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20"
                >
                  <Ban className="w-3 h-3" /> Échouer
                </button>
              </div>
              <div className="mt-3 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Stratégie N→1 (parents)
                </p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(
                    [
                      {
                        id: 'AND' as ExecutionStrategy,
                        label: 'AND',
                        hint: 'Tous les parents Completed',
                      },
                      {
                        id: 'OR' as ExecutionStrategy,
                        label: 'OR',
                        hint: 'Au moins un parent Completed',
                      },
                    ] as const
                  ).map((opt) => {
                    const current =
                      ctx.node.executionStrategy ??
                      joinModeToStrategy(ctx.node.joinMode as JoinMode);
                    const sel = current === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          WorkflowEngine.setExecutionStrategy(
                            ctx.wf.id,
                            ctx.node.id,
                            opt.id
                          )
                        }
                        className={`rounded-xl border px-2.5 py-2 text-left transition-colors ${
                          sel
                            ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'
                            : 'border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <span className="block text-[11px] font-bold tracking-wide">
                          {opt.label}
                        </span>
                        <span className="block text-[9px] opacity-70 mt-0.5 leading-snug">
                          {opt.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[9px] text-zinc-600 leading-relaxed">
                  Dispersion 1→N automatique : un nœud Completed active toutes ses
                  sorties liées.
                </p>
              </div>
            </section>

            {/* Trigger config */}
            {(ctx.node.type === 'trigger' || ctx.node.trigger?.kind !== 'none') && (
              <section className="fm-inspector-section">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-2">
                  Déclencheur
                </p>
                <select
                  value={ctx.node.trigger?.kind ?? 'manual'}
                  onChange={(e) =>
                    TriggerService.configure(ctx.wf.id, ctx.node.id, {
                      kind: e.target.value as TriggerKind,
                      enabled: e.target.value !== 'none',
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-200 outline-none mb-2"
                >
                  <option value="manual">Manuel</option>
                  <option value="time">Temporel (heure)</option>
                  <option value="event">Événement système</option>
                  <option value="none">Aucun</option>
                </select>
                {ctx.node.trigger?.kind === 'time' && (
                  <input
                    type="time"
                    value={ctx.node.trigger.timeOfDay ?? '09:00'}
                    onChange={(e) =>
                      TriggerService.configure(ctx.wf.id, ctx.node.id, {
                        timeOfDay: e.target.value,
                        kind: 'time',
                        enabled: true,
                      })
                    }
                    className="w-full px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-200 outline-none"
                  />
                )}
                {ctx.node.trigger?.kind === 'event' && (
                  <select
                    value={ctx.node.trigger.eventName ?? 'BRAIN_DUMP_ITEM_CONVERTED'}
                    onChange={(e) =>
                      TriggerService.configure(ctx.wf.id, ctx.node.id, {
                        eventName: e.target.value,
                        kind: 'event',
                        enabled: true,
                      })
                    }
                    className="w-full px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-200 outline-none"
                  >
                    <option value="BRAIN_DUMP_ITEM_CONVERTED">Capture convertie</option>
                    <option value="CAPTURE_ADDED">Capture ajoutée</option>
                    <option value="RECURRENCE_TRIGGERED">Récurrence déclenchée</option>
                  </select>
                )}
                {ctx.node.type === 'trigger' && (
                  <button
                    type="button"
                    onClick={() => TriggerService.fireManual(ctx.wf.id, ctx.node.id)}
                    className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold
                      bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Déclencher maintenant
                  </button>
                )}
              </section>
            )}

            {/* Type */}
            <section className="fm-inspector-section">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 mb-2">
                Type
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TYPES.map((t) => {
                  const m = NODE_TYPE_META[t];
                  const sel = ctx.node.type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => patch({ type: t })}
                      className={`px-2 py-1 rounded-md text-[10px] font-medium border transition-colors ${
                        sel
                          ? 'border-white/20 text-zinc-100'
                          : 'border-white/[0.06] text-zinc-500 hover:text-zinc-300'
                      }`}
                      style={
                        sel
                          ? { background: m.bg, borderColor: m.ring, color: m.color }
                          : undefined
                      }
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Description */}
            <section className="fm-inspector-section">
              <header className="flex items-center gap-2 mb-2">
                <AlignLeft className="w-3.5 h-3.5 text-zinc-500" />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Description
                </h3>
              </header>
              <textarea
                rows={3}
                value={ctx.node.description ?? ''}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="Notes, contexte, critères de done…"
                className="w-full resize-none rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2.5
                  text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-500/35 leading-relaxed"
              />
            </section>

            {/* Priority + Status */}
            <div className="grid grid-cols-2 gap-3">
              <section className="fm-inspector-section">
                <header className="flex items-center gap-1.5 mb-2">
                  <Flag className="w-3 h-3 text-zinc-500" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    Priorité
                  </h3>
                </header>
                <select
                  value={ctx.node.priority}
                  onChange={(e) =>
                    patch({ priority: e.target.value as NodePriority })
                  }
                  className="w-full px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-200 outline-none"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </section>

              <section className="fm-inspector-section">
                <header className="flex items-center gap-1.5 mb-2">
                  <Check className="w-3 h-3 text-zinc-500" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    Statut
                  </h3>
                </header>
                <select
                  value={exec}
                  onChange={(e) =>
                    patch({
                      status: e.target.value as NodeStatus,
                      executionState: e.target.value as NodeStatus,
                    })
                  }
                  className="w-full px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-200 outline-none"
                >
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </section>
            </div>

            {/* Due date */}
            <section className="fm-inspector-section">
              <header className="flex items-center gap-2 mb-2">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Échéance
                </h3>
                {ctx.node.dueDate && (
                  <button
                    type="button"
                    className="ml-auto text-[10px] text-zinc-500 hover:text-zinc-300"
                    onClick={() => patch({ dueDate: null })}
                  >
                    Effacer
                  </button>
                )}
              </header>
              <input
                type="datetime-local"
                value={dueInputValue(ctx.node.dueDate)}
                onChange={(e) => {
                  const v = e.target.value;
                  patch({ dueDate: v ? new Date(v).toISOString() : null });
                }}
                className="w-full px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-200 outline-none focus:border-indigo-500/35"
              />
            </section>

            {/* Subtasks */}
            <SubtaskList workflowId={ctx.wf.id} node={ctx.node} />

            {/* Recurrence */}
            <RecurrenceConfigurator
              rule={ctx.node.recurrence}
              highlight={ctx.node.type === 'routine'}
              onChange={(partial) => {
                RecurrenceEngine.configure(ctx.wf.id, ctx.node.id, partial);
              }}
            />
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-white/[0.06] flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (confirm('Supprimer ce nœud et ses liaisons ?')) {
                  WorkflowEngine.deleteNode(ctx.wf.id, ctx.node.id);
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs text-rose-300/90
                hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Supprimer
            </button>
            <button
              type="button"
              onClick={() => StateStore.closeInspector()}
              className="ml-auto px-3 py-2 rounded-lg text-xs font-medium text-zinc-300
                bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors"
            >
              Fermer
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
