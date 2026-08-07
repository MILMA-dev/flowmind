/**
 * useUniversalDraggable — rend un élément glissable (HTML5 DnD)
 */
import { useCallback } from 'react';
import {
  DRAG_TYPES,
  ENTITY_TO_MIME,
  type UniversalEntityType,
  type UniversalPayload,
} from '../core/Types';
import { useDragDropOptional } from '../context/DragDropContext';

export interface DraggableOptions {
  payload: UniversalPayload | null | undefined;
  disabled?: boolean;
}

export function useUniversalDraggable({ payload, disabled }: DraggableOptions) {
  const dnd = useDragDropOptional();

  const onDragStart = useCallback(
    (e: React.DragEvent) => {
      if (disabled || !payload) {
        e.preventDefault();
        return;
      }
      const mime = ENTITY_TO_MIME[payload.sourceType as UniversalEntityType];
      const json = JSON.stringify(payload);

      e.dataTransfer.effectAllowed = 'copyMove';
      e.dataTransfer.setData(mime, json);
      e.dataTransfer.setData(DRAG_TYPES.UNIVERSAL, json);
      // text/plain fallback
      e.dataTransfer.setData('text/plain', payload.label);

      // Ghost image légère
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.classList.add('fm-dragging');
      }

      dnd?.beginDrag(payload);
    },
    [disabled, payload, dnd]
  );

  const onDragEnd = useCallback(
    (e: React.DragEvent) => {
      if (e.currentTarget instanceof HTMLElement) {
        e.currentTarget.classList.remove('fm-dragging');
      }
      dnd?.endDrag();
    },
    [dnd]
  );

  const onDrag = useCallback(
    (e: React.DragEvent) => {
      if (e.clientX || e.clientY) {
        dnd?.setPointer(e.clientX, e.clientY);
      }
    },
    [dnd]
  );

  return {
    draggable: !disabled && !!payload,
    onDragStart,
    onDragEnd,
    onDrag,
    'data-fm-draggable': payload?.sourceType ?? undefined,
  } as const;
}
