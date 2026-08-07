/**
 * DragDropContext — Provider global HTML5 DnD Cross-Feature
 * Équipe MILMA Entreprise
 */
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { EventBus } from '../core/EventBus';
import { AppEvents, type DropTargetModule, type UniversalPayload } from '../core/Types';
import type { ConversionExtraConfig, UniversalEntityType } from '../core/Types';

export interface DragState {
  isDragging: boolean;
  draggedItem: UniversalPayload | null;
  sourceModule: string | null;
  /** Zone survolée */
  hoverTarget: DropTargetModule | null;
  /** Position pointeur (overlay) */
  pointer: { x: number; y: number } | null;
}

export interface PendingConversion {
  payload: UniversalPayload;
  targetType: UniversalEntityType;
  targetModule: DropTargetModule;
  extra?: ConversionExtraConfig;
}

interface DragDropContextValue extends DragState {
  beginDrag: (payload: UniversalPayload) => void;
  endDrag: () => void;
  setHoverTarget: (zone: DropTargetModule | null) => void;
  setPointer: (x: number, y: number) => void;
  pendingConversion: PendingConversion | null;
  requestConversion: (pending: PendingConversion) => void;
  clearPending: () => void;
  /** dataTransfer mime currently active */
  activeMime: string | null;
}

const DragDropContext = createContext<DragDropContextValue | null>(null);

const initial: DragState = {
  isDragging: false,
  draggedItem: null,
  sourceModule: null,
  hoverTarget: null,
  pointer: null,
};

export function DragDropProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DragState>(initial);
  const [pendingConversion, setPending] = useState<PendingConversion | null>(
    null
  );
  const draggingRef = useRef(false);

  const beginDrag = useCallback((payload: UniversalPayload) => {
    draggingRef.current = true;
    setState({
      isDragging: true,
      draggedItem: payload,
      sourceModule: payload.sourceModule,
      hoverTarget: null,
      pointer: null,
    });
    EventBus.publish(AppEvents.DRAG_STARTED, { payload });
  }, []);

  const endDrag = useCallback(() => {
    draggingRef.current = false;
    setState(initial);
    EventBus.publish(AppEvents.DRAG_ENDED, {});
  }, []);

  const setHoverTarget = useCallback((zone: DropTargetModule | null) => {
    setState((s) => (s.hoverTarget === zone ? s : { ...s, hoverTarget: zone }));
  }, []);

  const setPointer = useCallback((x: number, y: number) => {
    setState((s) => {
      if (!s.isDragging) return s;
      return { ...s, pointer: { x, y } };
    });
  }, []);

  const requestConversion = useCallback((pending: PendingConversion) => {
    setPending(pending);
  }, []);

  const clearPending = useCallback(() => setPending(null), []);

  const value = useMemo<DragDropContextValue>(
    () => ({
      ...state,
      beginDrag,
      endDrag,
      setHoverTarget,
      setPointer,
      pendingConversion,
      requestConversion,
      clearPending,
      activeMime: state.draggedItem
        ? state.draggedItem.sourceType
        : null,
    }),
    [
      state,
      beginDrag,
      endDrag,
      setHoverTarget,
      setPointer,
      pendingConversion,
      requestConversion,
      clearPending,
    ]
  );

  return (
    <DragDropContext.Provider value={value}>{children}</DragDropContext.Provider>
  );
}

export function useDragDrop(): DragDropContextValue {
  const ctx = useContext(DragDropContext);
  if (!ctx) {
    throw new Error('useDragDrop must be used within DragDropProvider');
  }
  return ctx;
}

/** Version safe hors provider */
export function useDragDropOptional(): DragDropContextValue | null {
  return useContext(DragDropContext);
}
