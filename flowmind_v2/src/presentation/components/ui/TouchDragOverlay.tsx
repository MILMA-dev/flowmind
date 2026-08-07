/**
 * TouchDragOverlay — accompagnement visuel du doigt (mobile)
 * Réutilise l'état DragDropContext
 */
import { motion, AnimatePresence } from 'framer-motion';
import { useDragDropOptional } from '../../../context/DragDropContext';
import { ENTITY_LABELS } from '../../../core/Types';
import { useIsDesktop } from '../../../hooks/useMediaQuery';

export default function TouchDragOverlay() {
  const dnd = useDragDropOptional();
  const isDesktop = useIsDesktop();

  // Sur desktop, DropZoneOverlay gère le ghost
  if (isDesktop) return null;
  if (!dnd?.isDragging || !dnd.draggedItem) return null;

  const pointer = dnd.pointer;

  return (
    <AnimatePresence>
      {pointer && (
        <motion.div
          className="fixed z-[100] pointer-events-none"
          style={{ left: pointer.x, top: pointer.y }}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
        >
          <div className="-translate-x-1/2 -translate-y-full mb-3 px-3 py-2 rounded-2xl
            border border-indigo-400/40 bg-[#0c0d12]/95 shadow-2xl shadow-indigo-500/30
            backdrop-blur-md max-w-[200px]">
            <p className="text-[9px] uppercase tracking-wider text-indigo-300 font-semibold">
              {ENTITY_LABELS[dnd.draggedItem.sourceType]}
            </p>
            <p className="text-xs text-zinc-100 truncate font-medium">
              {dnd.draggedItem.label}
            </p>
          </div>
          {/* doigt point */}
          <span className="absolute left-1/2 top-0 -translate-x-1/2 w-3 h-3 rounded-full
            bg-indigo-400 shadow-[0_0_12px_rgba(129,140,248,0.8)] animate-ping" />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
