/**
 * DropZoneOverlay — indicateurs visuels pendant un drag cross-feature
 */
import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  GitBranch,
  Inbox,
  ListChecks,
  StickyNote,
  ArrowRight,
} from 'lucide-react';
import { useDragDropOptional } from '../../../context/DragDropContext';
import {
  ENTITY_LABELS,
  ZONE_META,
  ZONE_PRIMARY_TARGET,
  type DropTargetModule,
  type UniversalEntityType,
} from '../../../core/Types';
import { UniversalConverter } from '../../../core/UniversalConverter';

const ZONE_ICONS: Record<DropTargetModule, React.ReactNode> = {
  workflows: <GitBranch className="w-5 h-5" />,
  notes: <StickyNote className="w-5 h-5" />,
  todos: <ListChecks className="w-5 h-5" />,
  calendar: <CalendarDays className="w-5 h-5" />,
  braindump: <Inbox className="w-5 h-5" />,
};

const ZONE_HINT: Record<DropTargetModule, string> = {
  workflows: 'Convertir en Nœud',
  notes: 'Convertir en Note Dek',
  todos: "Convertir en Unité d'Action",
  calendar: 'Convertir en Événement',
  braindump: 'Envoyer au Brain Dump',
};

/** Ghost flottant sous le curseur */
export function DragGhost() {
  const dnd = useDragDropOptional();
  if (!dnd?.isDragging || !dnd.draggedItem || !dnd.pointer) return null;

  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={{
        left: dnd.pointer.x + 12,
        top: dnd.pointer.y + 12,
      }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-[200px] px-3 py-2 rounded-xl border border-indigo-400/40
          bg-[#12141c]/95 shadow-2xl shadow-indigo-500/20 backdrop-blur-md"
      >
        <p className="text-[10px] uppercase tracking-wider text-indigo-300/80 font-semibold">
          {ENTITY_LABELS[dnd.draggedItem.sourceType]}
        </p>
        <p className="text-xs text-zinc-100 truncate font-medium mt-0.5">
          {dnd.draggedItem.label}
        </p>
      </motion.div>
    </div>
  );
}

/** Bandeau cible sur zone active */
export function DropTargetBanner({
  module,
  active,
}: {
  module: DropTargetModule;
  active: boolean;
}) {
  const dnd = useDragDropOptional();
  if (!dnd?.isDragging || !dnd.draggedItem) return null;

  const source = dnd.draggedItem.sourceType;
  const target = ZONE_PRIMARY_TARGET[module];
  const ok = UniversalConverter.canConvert(source, target);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          className={`pointer-events-none absolute inset-x-3 top-3 z-40 flex items-center justify-center`}
        >
          <div
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl border backdrop-blur-xl shadow-xl text-sm font-medium ${
              ok
                ? 'bg-indigo-500/20 border-indigo-400/40 text-indigo-100'
                : 'bg-rose-500/15 border-rose-400/30 text-rose-200'
            }`}
          >
            <span className="opacity-80">{ZONE_ICONS[module]}</span>
            {ok ? (
              <>
                <span className="text-zinc-400 text-xs">
                  {ENTITY_LABELS[source]}
                </span>
                <ArrowRight className="w-3.5 h-3.5 text-indigo-300" />
                <span>{ZONE_HINT[module]}</span>
              </>
            ) : (
              <span>Conversion non supportée ici</span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Overlay plein écran subtil quand un drag est actif */
export default function DropZoneOverlay() {
  const dnd = useDragDropOptional();
  if (!dnd?.isDragging || !dnd.draggedItem) return null;

  const hover = dnd.hoverTarget;
  const source = dnd.draggedItem.sourceType;

  return (
    <>
      <DragGhost />
      {/* Hint bas d'écran */}
      <div className="fixed bottom-20 lg:bottom-6 inset-x-0 z-[90] pointer-events-none flex justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-4 py-2 rounded-full border border-white/10 bg-black/70 backdrop-blur-md
            text-[11px] text-zinc-300 shadow-xl max-w-lg text-center"
        >
          Glissez vers une <strong className="text-zinc-100">Zone de Travail</strong>
          {' · '}
          source{' '}
          <span className="text-indigo-300">{ENTITY_LABELS[source as UniversalEntityType]}</span>
          {hover && (
            <>
              {' → '}
              <span className="text-emerald-300">
                {ZONE_META[hover]?.shortLabel ?? hover}
              </span>
            </>
          )}
        </motion.div>
      </div>
    </>
  );
}
