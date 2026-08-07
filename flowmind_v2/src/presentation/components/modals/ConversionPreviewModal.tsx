/**
 * ConversionPreviewModal — confirmation / mapping avant conversion
 */
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, X } from 'lucide-react';
import { useDragDropOptional } from '../../../context/DragDropContext';
import { UniversalConverter } from '../../../core/UniversalConverter';
import {
  ENTITY_LABELS,
  type UniversalEntityType,
} from '../../../core/Types';
import { useAppState } from '../../../hooks/useStateStore';
import {
  fromLocalInputValue,
  toLocalInputValue,
} from '../../../core/calendarUtils';
import { EventBus } from '../../../core/EventBus';
import { AppEvents } from '../../../core/Types';

export default function ConversionPreviewModal() {
  const dnd = useDragDropOptional();
  const { workflows } = useAppState();
  const pending = dnd?.pendingConversion ?? null;

  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [workflowId, setWorkflowId] = useState('');

  const preview = useMemo(() => {
    if (!pending) return null;
    return UniversalConverter.convertEntity(
      pending.payload.sourceType,
      pending.targetType,
      pending.payload.data,
      { ...pending.extra, preview: true }
    ).preview;
  }, [pending]);

  useEffect(() => {
    if (!pending || !preview) return;
    setTitle(String(preview.title ?? pending.payload.label));
    const now = new Date();
    now.setMinutes(0, 0, 0);
    now.setHours(now.getHours() + 1);
    const defStart = toLocalInputValue(now.toISOString());
    const defEnd = toLocalInputValue(
      new Date(now.getTime() + 60 * 60 * 1000).toISOString()
    );
    setStart(defStart);
    setEnd(defEnd);
    setWorkflowId(workflows[0]?.id ?? '');
  }, [pending?.payload.sourceId, pending?.targetType]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!dnd) return null;

  const close = () => dnd.clearPending();

  const confirm = () => {
    if (!pending) return;
    const extra = {
      ...pending.extra,
      title: title.trim() || undefined,
      start:
        pending.targetType === 'calendar_event' && start
          ? fromLocalInputValue(start)
          : pending.extra?.start,
      end:
        pending.targetType === 'calendar_event' && end
          ? fromLocalInputValue(end)
          : pending.extra?.end,
      workflowId:
        pending.targetType === 'workflow_node'
          ? workflowId || undefined
          : pending.extra?.workflowId,
    };

    const result = UniversalConverter.convertPayload(
      pending.payload,
      pending.targetType,
      extra
    );

    if (result.ok) {
      EventBus.publish(AppEvents.DROP_COMPLETED, {
        payload: pending.payload,
        targetModule: pending.targetModule,
        result,
      });
    }
    close();
  };

  return (
    <AnimatePresence>
      {pending && preview && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center px-4">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={close}
            aria-label="Fermer"
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0e1018] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Conversion universelle
                </p>
                <div className="flex items-center gap-2 mt-1 text-sm font-semibold text-zinc-100">
                  <span className="text-indigo-300">
                    {ENTITY_LABELS[pending.payload.sourceType]}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
                  <span className="text-emerald-300">
                    {ENTITY_LABELS[pending.targetType as UniversalEntityType]}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pb-4 space-y-3">
              <label className="block">
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                  Titre
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08]
                    text-sm text-zinc-100 outline-none focus:border-indigo-500/40"
                />
              </label>

              {typeof preview.content === 'string' && preview.content && (
                <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] px-3 py-2">
                  <p className="text-[10px] text-zinc-500 mb-1">Aperçu contenu</p>
                  <p className="text-xs text-zinc-400 line-clamp-4 whitespace-pre-wrap">
                    {preview.content}
                  </p>
                </div>
              )}

              {pending.targetType === 'calendar_event' && (
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[10px] text-zinc-500">Début</span>
                    <input
                      type="datetime-local"
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                      className="mt-1 w-full px-2 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-200 outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-[10px] text-zinc-500">Fin</span>
                    <input
                      type="datetime-local"
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                      className="mt-1 w-full px-2 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-200 outline-none"
                    />
                  </label>
                </div>
              )}

              {pending.targetType === 'workflow_node' && workflows.length > 0 && (
                <label className="block">
                  <span className="text-[10px] text-zinc-500">Workflow cible</span>
                  <select
                    value={workflowId}
                    onChange={(e) => setWorkflowId(e.target.value)}
                    className="mt-1 w-full px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.08] text-xs text-zinc-200 outline-none"
                  >
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.title}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={close}
                className="px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirm}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-indigo-500 text-white hover:bg-indigo-400 shadow-md shadow-indigo-500/25"
              >
                Convertir
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
