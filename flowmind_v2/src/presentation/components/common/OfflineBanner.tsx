import React, { useState, useEffect } from 'react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { db } from '../../../core/storage/IndexedDBAdapter';
import { OfflineQueueProcessor } from '../../../core/services/OfflineQueueProcessor';
import { WifiOff, RefreshCw, AlertCircle } from 'lucide-react';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();
  const [mutationCount, setMutationCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Écoute réactive de la table offline_mutations pour afficher le compteur de synchro en direct
  useEffect(() => {
    let active = true;

    const updateCount = async () => {
      try {
        const count = await db.offline_mutations.count();
        if (active) {
          setMutationCount(count);
        }
      } catch (err) {
        console.error('Failed to retrieve offline mutations count:', err);
      }
    };

    void updateCount();

    // Utilisation d'un polling de 1,5 seconde pour garantir l'actualisation sans impact sur les perfs
    const interval = setInterval(() => {
      void updateCount();
    }, 1500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const handleForceSync = async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);
    try {
      await OfflineQueueProcessor.processQueue();
    } catch (err) {
      console.error('Force synchronization failed:', err);
    } finally {
      setIsSyncing(false);
    }
  };

  if (isOnline && mutationCount === 0) {
    return null;
  }

  return (
    <div
      className={`
        w-full px-4 py-2 flex items-center justify-between text-xs font-medium transition-all duration-300
        ${
          !isOnline
            ? 'bg-amber-500/10 text-amber-400 border-b border-amber-500/20 shadow-md shadow-amber-500/5'
            : 'bg-indigo-500/10 text-indigo-400 border-b border-indigo-500/20 shadow-md shadow-indigo-500/5'
        }
      `}
    >
      <div className="flex items-center gap-2">
        {!isOnline ? (
          <WifiOff className="w-4 h-4 shrink-0 animate-pulse text-amber-500" />
        ) : (
          <AlertCircle className="w-4 h-4 shrink-0 text-indigo-400" />
        )}
        <span>
          {!isOnline
            ? `Mode hors-ligne actif · ${mutationCount} modification(s) en attente de connexion.`
            : `Connexion rétablie · ${mutationCount} modification(s) prêtes à être synchronisées.`}
        </span>
      </div>

      {isOnline && mutationCount > 0 && (
        <button
          type="button"
          onClick={handleForceSync}
          disabled={isSyncing}
          className="flex items-center gap-1.5 px-3 py-1 rounded bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 transition-all text-[11px] font-semibold text-indigo-300 active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Synchronisation...' : 'Synchroniser'}
        </button>
      )}
    </div>
  );
}

export default OfflineBanner;
