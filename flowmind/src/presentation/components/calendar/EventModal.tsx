/**
 * EventModal — Création / édition d'événement + liaison nœud workflow
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, GitBranch, Trash2, X } from 'lucide-react';
import type { CalendarEvent, Workflow } from '../../../core/Types';
import { CalendarManager } from '../../../core/CalendarManager';
import { CalendarScheduler } from '../../../core/CalendarScheduler';
import {
  fromLocalInputValue,
  toLocalInputValue,
} from '../../../core/calendarUtils';

const COLORS = [
  '#818cf8',
  '#22d3ee',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#fb923c',
];

interface Props {
  open: boolean;
  event: CalendarEvent | null;
  /** Préremplissage création */
  defaults?: Partial<CalendarEvent>;
  workflows: Workflow[];
  onClose: () => void;
}

export default function EventModal({
  open,
  event,
  defaults,
  workflows,
  onClose,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [color, setColor] = useState(COLORS[0]);
  const [workflowId, setWorkflowId] = useState('');
  const [nodeId, setNodeId] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfirmDelete(false);
    const base = event ?? defaults;
    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setMinutes(0, 0, 0);
    defaultStart.setHours(defaultStart.getHours() + 1);
    const defaultEnd = new Date(defaultStart.getTime() + 60 * 60 * 1000);

    setTitle(base?.title ?? '');
    setDescription(base?.description ?? '');
    setStart(
      toLocalInputValue(base?.start || base?.startDate || defaultStart.toISOString())
    );
    setEnd(
      toLocalInputValue(base?.end || base?.endDate || defaultEnd.toISOString())
    );
    setAllDay(base?.allDay ?? base?.isAllDay ?? false);
    setColor(base?.color ?? COLORS[0]);
    setWorkflowId(base?.linkedWorkflowId ?? '');
    setNodeId(base?.linkedNodeId ?? '');
  }, [open, event, defaults]);

  const nodes = useMemo(() => {
    const wf = workflows.find((w) => w.id === workflowId);
    return wf?.nodes ?? [];
  }, [workflows, workflowId]);

  const conflicts = useMemo(() => {
    if (!start || !end || allDay) return [];
    return CalendarManager.checkConflicts({
      id: event?.id,
      start: fromLocalInputValue(start),
      end: fromLocalInputValue(end),
      allDay: false,
    });
  }, [start, end, allDay, event?.id]);

  /** Exclusivité workflow vs activités multi-jours */
  const workflowAvailability = useMemo(() => {
    if (!start || !end) return [];
    return CalendarScheduler.getAvailableWorkflows(
      workflows,
      CalendarScheduler.getActivities(),
      fromLocalInputValue(start),
      fromLocalInputValue(end),
      null
    );
  }, [workflows, start, end]);

  const save = () => {
    if (!title.trim() || !start || !end) return;
    CalendarManager.saveEvent({
      id: event?.id,
      title: title.trim(),
      description,
      start: fromLocalInputValue(start),
      end: fromLocalInputValue(end),
      allDay,
      isAllDay: allDay,
      color,
      linkedWorkflowId: workflowId || null,
      linkedNodeId: nodeId || null,
    });
    onClose();
  };

  const remove = () => {
    if (!event?.id) return;
    CalendarManager.deleteEvent(event.id);
    setConfirmDelete(false);
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center px-4"
          role="dialog"
          aria-modal
        >
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            aria-label="Fermer"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0e1018] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-sm font-semibold text-zinc-100">
                {event ? 'Modifier l\'événement' : 'Nouvel événement'}
              </h3>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pb-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titre"
                className="w-full px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08]
                  text-sm text-zinc-100 placeholder:text-zinc-600 outline-none focus:border-indigo-500/40"
                autoFocus
              />

              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="Description"
                className="w-full resize-none px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08]
                  text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-500/40"
              />

              <label className="flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={allDay}
                  onChange={(e) => setAllDay(e.target.checked)}
                  className="rounded border-white/20"
                />
                Toute la journée
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                    Début
                  </span>
                  <input
                    type="datetime-local"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="mt-1 w-full px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08]
                      text-xs text-zinc-200 outline-none focus:border-indigo-500/40"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                    Fin
                  </span>
                  <input
                    type="datetime-local"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="mt-1 w-full px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08]
                      text-xs text-zinc-200 outline-none focus:border-indigo-500/40"
                  />
                </label>
              </div>

              {conflicts.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-rose-200/90">
                    <p className="font-medium">Conflit horaire</p>
                    <p className="text-rose-300/70 mt-0.5">
                      Chevauche {conflicts.map((c) => c.title).join(', ')}
                    </p>
                  </div>
                </div>
              )}

              <div>
                <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
                  Couleur
                </p>
                <div className="flex gap-1.5">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-6 h-6 rounded-full transition-transform ${
                        color === c ? 'ring-2 ring-white/40 scale-110' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Workflow link */}
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] p-3 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-300">
                  <GitBranch className="w-3.5 h-3.5" />
                  Trigger Workflow Nodal
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  À l'heure de début, le nœud lié sera déclenché automatiquement via
                  l'EventBus.
                </p>
                <select
                  value={workflowId}
                  onChange={(e) => {
                    setWorkflowId(e.target.value);
                    setNodeId('');
                  }}
                  className="w-full px-2.5 py-2 rounded-lg bg-[#0c0d12] border border-white/[0.08] text-xs text-zinc-200 outline-none"
                >
                  <option value="">Aucun workflow</option>
                  {workflowAvailability.map((a) => (
                    <option
                      key={a.workflowId}
                      value={a.workflowId}
                      disabled={!a.isAvailable}
                      className={!a.isAvailable ? 'text-zinc-500' : ''}
                    >
                      {a.isAvailable
                        ? a.title
                        : `${a.title} — ${a.reason ?? 'réservé'}`}
                    </option>
                  ))}
                </select>
                {workflowId && (
                  <select
                    value={nodeId}
                    onChange={(e) => setNodeId(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-lg bg-[#0c0d12] border border-white/[0.08] text-xs text-zinc-200 outline-none"
                  >
                    <option value="">Sélectionner un nœud…</option>
                    {nodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label} ({n.type})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-3 border-t border-white/[0.06] bg-white/[0.015]">
              {event?.id && !confirmDelete && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setConfirmDelete(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs text-rose-300
                    hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Supprimer
                </button>
              )}
              {event?.id && confirmDelete && (
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] text-rose-300/90 hidden sm:inline truncate max-w-[7rem]">
                    Confirmer ?
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      remove();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs font-semibold
                      bg-rose-500/20 text-rose-200 border border-rose-500/35 hover:bg-rose-500/30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Oui, supprimer
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setConfirmDelete(false);
                    }}
                    className="px-2 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 border border-white/[0.08]"
                  >
                    Non
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={onClose}
                className="ml-auto px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!title.trim()}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-500 text-white
                  hover:bg-indigo-400 disabled:opacity-40 shadow-md shadow-indigo-500/25"
              >
                Enregistrer
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
