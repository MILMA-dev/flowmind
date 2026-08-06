/**
 * RemoteDatabaseAdapter — connecteur base distante
 *
 * En l'absence de credentials Supabase/Firebase, utilise un store
 * "remote" isolé (localStorage namespace distant) avec latence simulée.
 * Si VITE_FLOWMIND_REMOTE_URL est défini, tente un fetch REST.
 *
 * Interface prête pour :
 *   - Supabase: from('profiles').upsert(...)
 *   - Firebase: doc(db, 'users', id).set(...)
 */

import type { ExtendedUserProfile, StorageConfig } from '../Types';

const DEFAULT_CONFIG: StorageConfig = {
  localNamespace: 'flowmind:hybrid:profile:',
  remoteNamespace: 'flowmind:remote-db:profiles:v1',
  remoteLatencyMs: 180,
  forceOffline: false,
  remoteEndpoint: null,
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isBrowserOnline(cfg: StorageConfig): boolean {
  if (cfg.forceOffline) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return false;
  }
  return true;
}

class RemoteDatabaseAdapterImpl {
  private config: StorageConfig = { ...DEFAULT_CONFIG };

  configure(partial: Partial<StorageConfig>): void {
    this.config = { ...this.config, ...partial };
    // Endpoint optionnel depuis env Vite
    try {
      const envUrl = import.meta.env?.VITE_FLOWMIND_REMOTE_URL as
        | string
        | undefined;
      if (envUrl && !partial.remoteEndpoint) {
        this.config.remoteEndpoint = envUrl;
      }
    } catch {
      /* ignore */
    }
  }

  getConfig(): StorageConfig {
    return { ...this.config };
  }

  isOnline(): boolean {
    return isBrowserOnline(this.config);
  }

  /** Lecture table remote (simulée ou HTTP) */
  async getUserProfile(userId: string): Promise<ExtendedUserProfile | null> {
    if (!this.isOnline()) {
      throw new Error('NETWORK_OFFLINE');
    }
    await sleep(this.config.remoteLatencyMs);

    if (this.config.remoteEndpoint) {
      try {
        const res = await fetch(
          `${this.config.remoteEndpoint.replace(/\/$/, '')}/profiles/${userId}`,
          { method: 'GET', headers: { Accept: 'application/json' } }
        );
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`REMOTE_HTTP_${res.status}`);
        return (await res.json()) as ExtendedUserProfile;
      } catch (err) {
        if ((err as Error).message?.startsWith('REMOTE_')) throw err;
        // Fallback store simulé
      }
    }

    return this.readSimulated(userId);
  }

  /** Upsert distant */
  async saveUserProfile(profile: ExtendedUserProfile): Promise<void> {
    if (!this.isOnline()) {
      throw new Error('NETWORK_OFFLINE');
    }
    await sleep(this.config.remoteLatencyMs);

    const payload: ExtendedUserProfile = {
      ...profile,
      pendingSync: false,
      lastSyncedAt: new Date().toISOString(),
      lastWriteSource: 'remote',
    };

    if (this.config.remoteEndpoint) {
      try {
        const res = await fetch(
          `${this.config.remoteEndpoint.replace(/\/$/, '')}/profiles/${profile.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );
        if (!res.ok) throw new Error(`REMOTE_HTTP_${res.status}`);
        // Miroir local remote pour cohérence offline demo
        this.writeSimulated(payload);
        return;
      } catch (err) {
        if ((err as Error).message === 'NETWORK_OFFLINE') throw err;
        // Fallback simulé si endpoint down
      }
    }

    this.writeSimulated(payload);
  }

  async deleteUserProfile(userId: string): Promise<void> {
    if (!this.isOnline()) throw new Error('NETWORK_OFFLINE');
    const all = this.readAllSimulated();
    delete all[userId];
    localStorage.setItem(this.config.remoteNamespace, JSON.stringify(all));
  }

  // ─── Simulated remote (PostgreSQL-like bucket) ────────

  private readAllSimulated(): Record<string, ExtendedUserProfile> {
    try {
      const raw = localStorage.getItem(this.config.remoteNamespace);
      return raw ? (JSON.parse(raw) as Record<string, ExtendedUserProfile>) : {};
    } catch {
      return {};
    }
  }

  private readSimulated(userId: string): ExtendedUserProfile | null {
    return this.readAllSimulated()[userId] ?? null;
  }

  private writeSimulated(profile: ExtendedUserProfile): void {
    const all = this.readAllSimulated();
    all[profile.id] = profile;
    localStorage.setItem(this.config.remoteNamespace, JSON.stringify(all));
  }
}

export const RemoteDatabaseAdapter = new RemoteDatabaseAdapterImpl();
export default RemoteDatabaseAdapter;
