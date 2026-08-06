/**
 * SyncContext — Provider multi-appareils / multi-comptes
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { EventBus } from '../../core/EventBus';
import { AppEvents, type GlobalSyncStatus } from '../../core/Types';
import { GlobalSyncEngine } from '../../core/services/GlobalSyncEngine';
import { useAuthOptional } from './AuthContext';

interface SyncContextValue {
  status: GlobalSyncStatus;
  deviceId: string;
  userId: string | null;
  forceSync: () => Promise<void>;
  lastRemoteDevice: string | null;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const auth = useAuthOptional();
  const [status, setStatus] = useState<GlobalSyncStatus>('idle');
  const [lastRemoteDevice, setLastRemoteDevice] = useState<string | null>(null);
  const userId = auth?.user?.id ?? null;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (userId) {
        await GlobalSyncEngine.activateForUser(userId);
        if (!cancelled) setStatus(GlobalSyncEngine.getStatus());
      } else if (GlobalSyncEngine.getUserId()) {
        await GlobalSyncEngine.deactivate();
        if (!cancelled) {
          setStatus('idle');
          setLastRemoteDevice(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const unsubs = [
      EventBus.subscribe(AppEvents.GLOBAL_SYNC_STATUS, (payload) => {
        const p = payload as { status?: GlobalSyncStatus };
        if (p?.status) setStatus(p.status);
      }),
      EventBus.subscribe(AppEvents.GLOBAL_SYNC_REMOTE_CHANGE, (payload) => {
        const p = payload as { fromDevice?: string };
        if (p?.fromDevice) setLastRemoteDevice(p.fromDevice);
      }),
      EventBus.subscribe(AppEvents.AUTH_SIGNED_OUT, () => {
        setStatus('idle');
        setLastRemoteDevice(null);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  const forceSync = useCallback(async () => {
    await GlobalSyncEngine.forceSyncNow();
    setStatus(GlobalSyncEngine.getStatus());
  }, []);

  const value = useMemo(
    () => ({
      status,
      deviceId: GlobalSyncEngine.getDeviceId(),
      userId,
      forceSync,
      lastRemoteDevice,
    }),
    [status, userId, forceSync, lastRemoteDevice]
  );

  return (
    <SyncContext.Provider value={value}>{children}</SyncContext.Provider>
  );
}

export function useGlobalSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error('useGlobalSync must be used within SyncProvider');
  }
  return ctx;
}

export function useGlobalSyncOptional(): SyncContextValue | null {
  return useContext(SyncContext);
}
