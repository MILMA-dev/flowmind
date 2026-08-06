/**
 * SyncStatusBadge — état de synchronisation hybride
 */
import { useEffect, useState } from 'react';
import {
  Check,
  Cloud,
  CloudOff,
  Loader2,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { EventBus } from '../../../core/EventBus';
import { AppEvents, type SyncStatus } from '../../../core/Types';
import { HybridStorageAdapter } from '../../../core/storage/HybridStorageAdapter';
import { ProfileSyncEngine } from '../../../core/services/ProfileSyncEngine';
import { LocalStorageAdapter } from '../../../core/storage/LocalStorageAdapter';
import { useAuthOptional } from '../../context/AuthContext';

const LABELS: Record<SyncStatus, string> = {
  synced: 'Synchronisé',
  pending: 'Modifications locales',
  syncing: 'Synchronisation…',
  offline: 'Hors-ligne',
  error: 'Erreur de sync',
  unknown: '—',
};

interface Props {
  compact?: boolean;
  showForceButton?: boolean;
  className?: string;
}

export default function SyncStatusBadge({
  compact = false,
  showForceButton = false,
  className = '',
}: Props) {
  const auth = useAuthOptional();
  const userId = auth?.user?.id;
  const [status, setStatus] = useState<SyncStatus>(() =>
    HybridStorageAdapter.getSyncStatus()
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [forcing, setForcing] = useState(false);

  useEffect(() => {
    if (!userId) return;
    const ext = LocalStorageAdapter.getUserProfileSync(userId);
    if (ext) {
      setLastSyncedAt(ext.lastSyncedAt);
      if (ext.pendingSync) setStatus('pending');
      else if (!navigator.onLine) setStatus('offline');
      else setStatus('synced');
    }
  }, [userId]);

  useEffect(() => {
    const unsub = EventBus.subscribe(AppEvents.PROFILE_SYNC_STATUS, (payload) => {
      const p = payload as { status?: SyncStatus; userId?: string };
      if (p?.status) setStatus(p.status);
    });
    const unsub2 = EventBus.subscribe(AppEvents.PROFILE_SYNCED, (payload) => {
      const p = payload as { profile?: { lastSyncedAt?: string | null } };
      if (p?.profile?.lastSyncedAt) setLastSyncedAt(p.profile.lastSyncedAt);
      setStatus('synced');
    });
    const unsub3 = EventBus.subscribe(AppEvents.PROFILE_UPDATED, (payload) => {
      const p = payload as {
        profile?: { pendingSync?: boolean; lastSyncedAt?: string | null };
      };
      if (p?.profile?.pendingSync) setStatus('pending');
      if (p?.profile?.lastSyncedAt) setLastSyncedAt(p.profile.lastSyncedAt);
    });
    const onOnline = () => setStatus((s) => (s === 'offline' ? 'syncing' : s));
    const onOffline = () => setStatus('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      unsub();
      unsub2();
      unsub3();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const force = async () => {
    setForcing(true);
    try {
      await ProfileSyncEngine.forceSyncNow();
    } finally {
      setForcing(false);
    }
  };

  const color =
    status === 'synced'
      ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25'
      : status === 'pending' || status === 'syncing'
        ? 'text-amber-200 bg-amber-500/15 border-amber-500/25'
        : status === 'offline'
          ? 'text-zinc-400 bg-white/[0.04] border-white/[0.08]'
          : status === 'error'
            ? 'text-rose-300 bg-rose-500/15 border-rose-500/25'
            : 'text-zinc-500 bg-white/[0.03] border-white/[0.06]';

  const Icon =
    status === 'synced'
      ? Check
      : status === 'syncing'
        ? Loader2
        : status === 'pending'
          ? Cloud
          : status === 'offline'
            ? CloudOff
            : status === 'error'
              ? AlertCircle
              : Cloud;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[10px] font-semibold ${color}`}
        title={
          lastSyncedAt
            ? `Dernière sync : ${new Date(lastSyncedAt).toLocaleString('fr-FR')}`
            : LABELS[status]
        }
      >
        <Icon
          className={`w-3 h-3 ${status === 'syncing' || forcing ? 'animate-spin' : status === 'pending' ? 'animate-pulse' : ''}`}
        />
        {!compact && <span>{LABELS[status]}</span>}
      </span>
      {showForceButton && (
        <button
          type="button"
          onClick={() => void force()}
          disabled={forcing || status === 'syncing'}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium
            text-indigo-200 border border-indigo-500/25 bg-indigo-500/10
            hover:bg-indigo-500/20 disabled:opacity-40 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${forcing ? 'animate-spin' : ''}`} />
          Forcer la sync
        </button>
      )}
    </div>
  );
}
