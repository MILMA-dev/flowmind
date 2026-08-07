/**
 * Hook React pour s'abonner au StateStore sans couplage direct module-à-module
 */
import { useSyncExternalStore, useCallback } from 'react';
import { StateStore } from '../core/StateStore';
import type { AppState } from '../core/Types';

export function useAppState(): AppState {
  return useSyncExternalStore(
    (onStoreChange) => StateStore.subscribe(onStoreChange),
    () => StateStore.getState(),
    () => StateStore.getState()
  );
}

export function useActiveZone() {
  const state = useAppState();
  const setZone = useCallback((zone: AppState['ui']['activeZone']) => {
    StateStore.setActiveZone(zone);
  }, []);
  return { activeZone: state.ui.activeZone, setZone };
}

export function useUI() {
  const state = useAppState();
  return {
    ui: state.ui,
    toggleSidebar: () => StateStore.toggleSidebar(),
    setSidebarCollapsed: (v: boolean) => StateStore.setSidebarCollapsed(v),
  };
}
