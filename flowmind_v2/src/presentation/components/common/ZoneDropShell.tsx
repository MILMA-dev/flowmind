/**
 * ZoneDropShell — enveloppe droppable d'une zone de travail
 */
import type { DropTargetModule } from '../../../core/Types';
import { useUniversalDrop } from '../../../hooks/useUniversalDrop';
import { DropTargetBanner } from './DropZoneOverlay';
import { useDragDropOptional } from '../../../context/DragDropContext';

interface Props {
  module: DropTargetModule;
  children: React.ReactNode;
  className?: string;
  requirePreview?: boolean;
}

export default function ZoneDropShell({
  module,
  children,
  className = '',
  requirePreview,
}: Props) {
  const dnd = useDragDropOptional();
  const needsPreview =
    requirePreview ??
    (module === 'calendar' || module === 'workflows');

  const { dropHandlers, dropClassName, isOver, canAcceptCurrent } =
    useUniversalDrop({
      targetModule: module,
      requirePreview: needsPreview
        ? (p) => {
            // Preview si calendrier toujours ; workflows si pas de workflow actif simple ok
            if (module === 'calendar') return true;
            if (module === 'workflows') return true;
            return p.sourceType === 'todo_list';
          }
        : false,
    });

  const showHighlight = dnd?.isDragging && (isOver || dnd.hoverTarget === module);

  return (
    <div
      className={`relative h-full min-h-0 ${className} ${dropClassName} ${
        showHighlight && canAcceptCurrent
          ? 'fm-drop-active'
          : showHighlight
            ? 'fm-drop-reject'
            : ''
      } transition-[box-shadow,background-color] duration-150 rounded-none`}
      data-drop-zone={module}
      {...dropHandlers}
    >
      <DropTargetBanner module={module} active={!!isOver && !!dnd?.isDragging} />
      {children}
    </div>
  );
}
