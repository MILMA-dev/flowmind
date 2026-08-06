/**
 * RealtimeSyncIndicator — badge multi-appareils
 */
import {
  Cloud,
  CloudOff,
  Laptop,
  Loader2,
  RefreshCw,
  Smartphone,
  Check,
} from 'lucide-react';
import { useGlobalSyncOptional } from '../../context/SyncContext';
import type { GlobalSyncStatus } from '../../../core/Types';

const META: Record<
  GlobalSyncStatus,
  { label: string; className: string; Icon: typeof Check }
> = {
  idle: {
    label: 'Local',
    className: 'text-zinc-500 bg-white/[0.03] border-white/[0.06]',
    Icon: Laptop,
  },
  hydrating: {
    label: 'Chargement cloud…',
    className: 'text-sky-300 bg-sky-500/15 border-sky-500/25',
    Icon: Loader2,
  },
  syncing: {
    label: 'Sync…',
    className: 'text-amber-200 bg-amber-500/15 border-amber-500/25',
    Icon: Loader2,
  },
  synced: {
    label: 'Multi-appareils',
    className: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/25',
    Icon: Check,
  },
  offline: {
    label: 'Hors-ligne',
    className: 'text-zinc-400 bg-white/[0.04] border-white/[0.08]',
    Icon: CloudOff,
  },
  error: {
    label: 'Erreur sync',
    className: 'text-rose-300 bg-rose-500/15 border-rose-500/25',
    Icon: CloudOff,
  },
  multi_device: {
    label: 'MAJ appareil',
    className: 'text-indigo-200 bg-indigo-500/15 border-indigo-500/30',
    Icon: Smartphone,
  },
};

interface Props {
  compact?: boolean;
  showForce?: boolean;
}

export default function RealtimeSyncIndicator({
  compact = false,
  showForce = true,
}: Props) {
  const sync = useGlobalSyncOptional();
  if (!sync || !sync.userId) return null;

  const meta = META[sync.status] ?? META.idle;
  const Icon = meta.Icon;
  const spin =
    sync.status === 'syncing' ||
    sync.status === 'hydrating';

  return (
    <div className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold ${meta.className}`}
        title={
          sync.lastRemoteDevice
            ? `Dernier appareil distant : ${sync.lastRemoteDevice}`
            : `Device ${sync.deviceId}`
        }
      >
        <Icon className={`w-3 h-3 ${spin ? 'animate-spin' : ''}`} />
        {!compact && <span>{meta.label}</span>}
        {compact && sync.status === 'synced' && (
          <Cloud className="w-3 h-3 opacity-70" />
        )}
      </span>
      {showForce && !compact && (
        <button
          type="button"
          onClick={() => void sync.forceSync()}
          className="p-1 rounded-md text-zinc-500 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
          title="Forcer la synchronisation multi-appareils"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
