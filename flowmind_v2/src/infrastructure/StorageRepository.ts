/**
 * FlowMind — StorageRepository
 * LocalStorage scopé par compte (ScopeManager)
 * Équipe MILMA Entreprise
 */

import type { AppState } from '../core/Types';
import { ScopeManager } from '../core/storage/ScopeManager';

export interface StorageMeta {
  lastSavedAt: string | null;
  version: number;
  bytes: number;
}

export const HYBRID_STORAGE_HINT = {
  appState: 'scoped localStorage via ScopeManager',
  userProfile: 'HybridStorageAdapter (local + remote)',
  syncQueueKey: 'flowmind_sync_queue',
  multiDevice: 'GlobalSyncEngine cloud snapshot',
} as const;

class StorageRepositoryImpl {
  private resolveKeys(): { key: string; metaKey: string } {
    return {
      key: ScopeManager.appStateKey(),
      metaKey: ScopeManager.appMetaKey(),
    };
  }

  async save(state: AppState): Promise<StorageMeta> {
    return new Promise((resolve, reject) => {
      const run = () => {
        try {
          const { key, metaKey } = this.resolveKeys();
          const payload = JSON.stringify(state);
          localStorage.setItem(key, payload);
          const meta: StorageMeta = {
            lastSavedAt: new Date().toISOString(),
            version: state.version,
            bytes: payload.length,
          };
          localStorage.setItem(metaKey, JSON.stringify(meta));
          resolve(meta);
        } catch (err) {
          reject(err);
        }
      };

      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => run(), { timeout: 500 });
      } else {
        setTimeout(run, 0);
      }
    });
  }

  async load(): Promise<AppState | null> {
    try {
      const { key } = this.resolveKeys();
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as AppState;
    } catch (err) {
      console.error('[StorageRepository] Échec du chargement:', err);
      return null;
    }
  }

  loadSync(): AppState | null {
    try {
      const { key } = this.resolveKeys();
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as AppState;
    } catch {
      return null;
    }
  }

  getMeta(): StorageMeta | null {
    try {
      const { metaKey } = this.resolveKeys();
      const raw = localStorage.getItem(metaKey);
      return raw ? (JSON.parse(raw) as StorageMeta) : null;
    } catch {
      return null;
    }
  }

  async clear(): Promise<void> {
    const { key, metaKey } = this.resolveKeys();
    localStorage.removeItem(key);
    localStorage.removeItem(metaKey);
  }

  /** Clear guest scope only */
  async clearGuest(): Promise<void> {
    const key = ScopeManager.getScopedKey(null, 'app-state');
    const meta = ScopeManager.getScopedKey(null, 'app-meta');
    localStorage.removeItem(key);
    localStorage.removeItem(meta);
  }

  isAvailable(): boolean {
    try {
      const t = '__fm_test__';
      localStorage.setItem(t, '1');
      localStorage.removeItem(t);
      return true;
    } catch {
      return false;
    }
  }
}

export const StorageRepository = new StorageRepositoryImpl();
export default StorageRepository;
