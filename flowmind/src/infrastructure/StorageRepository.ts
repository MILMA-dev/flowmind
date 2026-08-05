/**
 * FlowMind — StorageRepository
 * Couche d'abstraction LocalStorage / future IndexedDB
 * Équipe MILMA Entreprise
 */

import type { AppState } from '../core/Types';

const STORAGE_KEY = 'flowmind:app-state:v1';
const STORAGE_META_KEY = 'flowmind:meta:v1';

export interface StorageMeta {
  lastSavedAt: string | null;
  version: number;
  bytes: number;
}

class StorageRepositoryImpl {
  private key: string;
  private metaKey: string;

  constructor(key = STORAGE_KEY, metaKey = STORAGE_META_KEY) {
    this.key = key;
    this.metaKey = metaKey;
  }

  /**
   * Sauvegarde asynchrone de l'état global.
   * Utilise requestIdleCallback si disponible pour ne pas bloquer l'UI.
   */
  async save(state: AppState): Promise<StorageMeta> {
    return new Promise((resolve, reject) => {
      const run = () => {
        try {
          const payload = JSON.stringify(state);
          localStorage.setItem(this.key, payload);
          const meta: StorageMeta = {
            lastSavedAt: new Date().toISOString(),
            version: state.version,
            bytes: payload.length,
          };
          localStorage.setItem(this.metaKey, JSON.stringify(meta));
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

  /** Charge l'état depuis le stockage local */
  async load(): Promise<AppState | null> {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      return JSON.parse(raw) as AppState;
    } catch (err) {
      console.error('[StorageRepository] Échec du chargement:', err);
      return null;
    }
  }

  /** Charge de façon synchrone (bootstrap initial) */
  loadSync(): AppState | null {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return null;
      return JSON.parse(raw) as AppState;
    } catch {
      return null;
    }
  }

  /** Métadonnées de la dernière sauvegarde */
  getMeta(): StorageMeta | null {
    try {
      const raw = localStorage.getItem(this.metaKey);
      return raw ? (JSON.parse(raw) as StorageMeta) : null;
    } catch {
      return null;
    }
  }

  /** Efface toutes les données FlowMind */
  async clear(): Promise<void> {
    localStorage.removeItem(this.key);
    localStorage.removeItem(this.metaKey);
  }

  /** Vérifie si le stockage est disponible */
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
