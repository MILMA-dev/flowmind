/**
 * ActivityModal — Planification multi-jours
 * Sélecteur de workflows avec désactivation temps réel selon [Start, End]
 * Équipe MILMA — Sous-Prompt 11B
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  CalendarRange,
  Lock,
  Trash2,
  X,
} from 'lucide-react';
import type { Activity, Workflow } from '../../../core/Types';
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
  activity: Activity | null;
  defaults?: Partial<Activity>;
  workflows: Workflow[];
  onClose: () => void;
}

function toDateInput(iso: string): string {
  if (!iso) return '';
  const v = toLocalInputValue(iso);
  return v.slice(0, 10);
}

function fromDateInput(d: string, endOfDay = false): string {
  if (!d) return new Date().toISOString();
  const t = endOfDay ? 'T23:59:59' : 'T00:00:00';
  return fromLocalInputValue(d + t);
}

export default function ActivityModal({
  open,
  activity,
  defaults,
  workflows,
  onClose,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [workflowId, setWorkflowId] = useState('');

  useEffect(() => {
    if (!open) return;
    const base = activity ?? defaults;
    const today = new Date();
    const defStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate()
    );
    const defEnd = new Date(defStart);
    defEnd.setDate(defEnd.getDate() + 3);

    setTitle(base?.title ?? '');
    setDescription(base?.description ?? '');
    setStart(toDateInput(base?.startDate || defStart.toISOString()));
    setEnd(toDateInput(base?.endDate || defEnd.toISOString()));
    setColor(base?.color ?? COLORS[0]);
    setWorkflowId(base?.workflowId ?? '');
  }, [open, activity, defaults]);

  const startIso = start ? fromDateInput(start, false) : '';
  const endIso = end ? fromDateInput(end, true) : '';
  const rangeInvalid =
    !!startIso && !!endIso && new Date(endIso) < new Date(startIso);

  /**
   * Recalcul temps réel dès que [start, end] change :
   * workflows réservés sur une plage chevauchante → disabled
   */
  const availability = useMemo(() => {
    if (!startIso || !endIso || rangeInvalid) return [];
    return CalendarScheduler.getAvailableWorkflows(
      workflows,
      CalendarScheduler.getActivities(),
      startIso,
      endIso,
      activity?.id
    );
  }, [workflows, startIso, endIso, activity?.id, open, rangeInvalid]);

  const lockedCount = availability.filter((a) => !a.isAvailable).length;
  const freeCount = availability.filter((a) => a.isAvailable).length;

  // Si le workflow sélectionné devient indispo après changement de dates → reset
  useEffect(() => {
    if (!workflowId) return;
    const slot = availability.find((a) => a.workflowId === workflowId);
    if (slot && !slot.isAvailable) setWorkflowId('');
  }, [availability, workflowId]);

  // Activités qui se chevauchent visuellement (info)
  const overlapping = useMemo(() => {
    if (!startIso || !endIso || rangeInvalid) return [];
    return CalendarScheduler.findOverlappingActivities(
      startIso,
      endIso,
      activity?.id
    );
  }, [startIso, endIso, activity?.id, rangeInvalid, open]);

  const save = () => {
    if (!title.trim() || !startIso || !endIso || rangeInvalid) return;

    const result = CalendarScheduler.saveActivity({
      id: activity?.id,
      title: title.trim(),
      description,
      startDate: startIso,
      endDate: endIso,
      allDay: true,
      color,
      workflowId: workflowId || null,
    });
    if (result) onClose();
  };

  const remove = () => {
    if (!activity) return;
    if (confirm('Supprimer cette activité planifiée ?')) {
      CalendarScheduler.deleteActivity(activity.id);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[76] flex items-center justify-center px-4">
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-label="Fermer"
          />
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0e1018] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <CalendarRange className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-zinc-100">
                  {activity ? "Modifier l'activité" : 'Planifier une activité'}
                </h3>
              </div>
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
                placeholder="Titre de l'activité"
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
                  text-xs text-zinc-200 placeholder:text-zinc-600 outline-none"
              />

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                    Début
                  </span>
                  <input
                    type="date"
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
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="mt-1 w-full px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08]
                      text-xs text-zinc-200 outline-none focus:border-indigo-500/40"
                  />
                </label>
              </div>

              {rangeInvalid && (
                <div className="flex items-center gap-2 text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  La date de fin doit être ≥ début
                </div>
              )}

              {overlapping.length > 0 && !rangeInvalid && (
                <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-[10px] text-sky-200/90">
                  <p className="font-medium mb-0.5">
                    Chevauche {overlapping.length} activité
                    {overlapping.length > 1 ? 's' : ''} (pistes parallèles)
                  </p>
                  <p className="text-sky-300/70 truncate">
                    {overlapping.map((a) => a.title).join(' · ')}
                  </p>
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
                      className={`w-6 h-6 rounded-full ${
                        color === c ? 'ring-2 ring-white/40 scale-110' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              {/* Workflow exclusivity — live disabled options */}
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/[0.06] p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold text-indigo-300">
                    Réserver un Workflow (exclusif)
                  </p>
                  {availability.length > 0 && (
                    <span className="text-[9px] tabular-nums text-zinc-500">
                      {freeCount} libre{freeCount !== 1 ? 's' : ''}
                      {lockedCount > 0 && (
                        <span className="text-amber-400/80">
                          {' '}
                          · {lockedCount} verrouillé
                          {lockedCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  Un workflow réservé du 5→9 est automatiquement désactivé pour
                  toute activité chevauchante (ex. 8→10).
                </p>

                <select
                  value={workflowId}
                  onChange={(e) => setWorkflowId(e.target.value)}
                  disabled={rangeInvalid || !startIso || !endIso}
                  className="w-full px-2.5 py-2 rounded-lg bg-[#0c0d12] border border-white/[0.08]
                    text-xs text-zinc-200 outline-none disabled:opacity-40"
                >
                  <option value="">Aucun workflow</option>
                  {availability.map((a) => (
                    <option
                      key={a.workflowId}
                      value={a.workflowId}
                      disabled={!a.isAvailable}
                      // Grisé via disabled natif + label explicite
                    >
                      {a.isAvailable
                        ? a.title
                        : a.disabledLabel ??
                          `${a.title} — ${a.reason ?? 'indisponible'}`}
                    </option>
                  ))}
                </select>

                {/* Liste visuelle des verrous */}
                {lockedCount > 0 && (
                  <div className="space-y-1 pt-1 max-h-28 overflow-y-auto">
                    {availability
                      .filter((a) => !a.isAvailable)
                      .map((a) => (
                        <div
                          key={a.workflowId}
                          className="flex items-start gap-1.5 text-[10px] px-2 py-1.5 rounded-lg
                            bg-amber-500/10 border border-amber-500/15 text-zinc-400"
                        >
                          <Lock className="w-3 h-3 text-amber-400/90 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <span className="text-zinc-300 font-medium">
                              {a.title}
                            </span>
                            <span className="block text-amber-200/70 truncate">
                              {a.reason}
                              {a.conflictingActivityTitle
                                ? ` · « ${a.conflictingActivityTitle} »`
                                : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 px-4 py-3 border-t border-white/[0.06]">
              {activity && (
                <button
                  type="button"
                  onClick={remove}
                  className="inline-flex items-center gap-1 px-2.5 py-2 rounded-lg text-xs text-rose-300
                    hover:bg-rose-500/10"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Supprimer
                </button>
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
                disabled={!title.trim() || !start || !end || rangeInvalid}
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
