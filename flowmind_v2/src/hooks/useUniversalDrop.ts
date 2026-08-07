/**
 * useUniversalDrop — zone réceptrice de drop cross-feature
 */
import { useCallback, useState } from 'react';
import {
  CONVERSION_MATRIX,
  DRAG_TYPES,
  MIME_TO_ENTITY,
  ZONE_PRIMARY_TARGET,
  type DropTargetModule,
  type UniversalEntityType,
  type UniversalPayload,
} from '../core/Types';
import { UniversalConverter } from '../core/UniversalConverter';
import { EventBus } from '../core/EventBus';
import { AppEvents } from '../core/Types';
import { useDragDropOptional } from '../context/DragDropContext';
import type { ConversionExtraConfig } from '../core/Types';

function parsePayload(dt: DataTransfer): UniversalPayload | null {
  // Essaie tous les MIME FlowMind
  const mimes = [
    DRAG_TYPES.UNIVERSAL,
    DRAG_TYPES.NOTE,
    DRAG_TYPES.TODO_ITEM,
    DRAG_TYPES.TODO_LIST,
    DRAG_TYPES.BRAIN_DUMP,
    DRAG_TYPES.CALENDAR_EVENT,
    DRAG_TYPES.WORKFLOW_NODE,
  ];
  for (const m of mimes) {
    const raw = dt.getData(m);
    if (!raw) continue;
    try {
      return JSON.parse(raw) as UniversalPayload;
    } catch {
      /* continue */
    }
  }
  return null;
}

function payloadFromDragState(
  dnd: ReturnType<typeof useDragDropOptional>
): UniversalPayload | null {
  return dnd?.draggedItem ?? null;
}

export interface DropOptions {
  targetModule: DropTargetModule;
  /** Override du type cible (sinon ZONE_PRIMARY_TARGET) */
  targetType?: UniversalEntityType;
  /** Types sources acceptés (défaut: tous compatibles) */
  accept?: UniversalEntityType[];
  /** Demande preview modal avant commit (ex: calendrier) */
  requirePreview?: boolean | ((p: UniversalPayload) => boolean);
  extraConfig?: ConversionExtraConfig;
  onConverted?: (createdId?: string) => void;
  disabled?: boolean;
}

export function useUniversalDrop(opts: DropOptions) {
  const dnd = useDragDropOptional();
  const [isOver, setIsOver] = useState(false);

  const targetType =
    opts.targetType ?? ZONE_PRIMARY_TARGET[opts.targetModule];

  const isCompatible = useCallback(
    (sourceType: UniversalEntityType) => {
      if (opts.accept && !opts.accept.includes(sourceType)) return false;
      return UniversalConverter.canConvert(sourceType, targetType);
    },
    [opts.accept, targetType]
  );

  const onDragEnter = useCallback(
    (e: React.DragEvent) => {
      if (opts.disabled) return;
      e.preventDefault();
      setIsOver(true);
      dnd?.setHoverTarget(opts.targetModule);
    },
    [opts.disabled, opts.targetModule, dnd]
  );

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      if (opts.disabled) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      if (!isOver) setIsOver(true);
      dnd?.setHoverTarget(opts.targetModule);
      if (e.clientX || e.clientY) dnd?.setPointer(e.clientX, e.clientY);
    },
    [opts.disabled, opts.targetModule, isOver, dnd]
  );

  const onDragLeave = useCallback(
    (e: React.DragEvent) => {
      const related = e.relatedTarget as Node | null;
      if (related && e.currentTarget.contains(related)) return;
      setIsOver(false);
      if (dnd?.hoverTarget === opts.targetModule) {
        dnd.setHoverTarget(null);
      }
    },
    [dnd, opts.targetModule]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOver(false);

      if (opts.disabled) return;

      let payload =
        parsePayload(e.dataTransfer) || payloadFromDragState(dnd);
      dnd?.endDrag();

      if (!payload) {
        // Tente de reconstruire depuis text
        const text = e.dataTransfer.getData('text/plain');
        if (!text) return;
        payload = {
          version: 1,
          sourceType: 'brain_dump',
          sourceModule: 'external',
          sourceId: '',
          data: { content: text, plainText: text, tags: [] },
          label: text.slice(0, 60),
          draggedAt: new Date().toISOString(),
        };
      }

      if (!isCompatible(payload.sourceType)) {
        EventBus.publish(AppEvents.TOAST_SHOW, {
          id: `toast_${Date.now()}`,
          type: 'warning',
          title: 'Drop incompatible',
          description: `${payload.sourceType} → ${targetType}`,
          duration: 2400,
        });
        return;
      }

      const needsPreview =
        typeof opts.requirePreview === 'function'
          ? opts.requirePreview(payload)
          : !!opts.requirePreview;

      if (needsPreview && dnd) {
        dnd.requestConversion({
          payload,
          targetType,
          targetModule: opts.targetModule,
          extra: opts.extraConfig,
        });
        return;
      }

      const result = UniversalConverter.convertPayload(
        payload,
        targetType,
        opts.extraConfig
      );

      if (result.ok) {
        EventBus.publish(AppEvents.DROP_COMPLETED, {
          payload,
          targetModule: opts.targetModule,
          result,
        });
        opts.onConverted?.(result.createdId);
      }
    },
    [opts, dnd, isCompatible, targetType]
  );

  /** Classes Tailwind de surbrillance */
  const dropClassName = isOver
    ? 'ring-2 ring-indigo-500 bg-indigo-500/10 ring-inset'
    : '';

  return {
    isOver,
    dropHandlers: {
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
    },
    dropClassName,
    targetType,
    /** true si le drag courant est compatible */
    canAcceptCurrent: dnd?.draggedItem
      ? isCompatible(dnd.draggedItem.sourceType)
      : false,
  };
}

/** Helpers pour valider MIME au dragover sans parse (types only) */
export function hasFlowMindDrag(dt: DataTransfer): boolean {
  const types = Array.from(dt.types || []);
  return types.some(
    (t) => t.startsWith('application/flowmind') || t === 'text/plain'
  );
}

export function entityFromMimeList(types: readonly string[]): UniversalEntityType | null {
  for (const t of types) {
    if (MIME_TO_ENTITY[t]) return MIME_TO_ENTITY[t];
  }
  return null;
}

export { CONVERSION_MATRIX };
