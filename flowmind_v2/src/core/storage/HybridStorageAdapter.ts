/**
 * HybridStorageAdapter — Dual-Write & Fast-Read
 * Orchestrateur LocalStorage + Remote DB
 * Équipe MILMA Entreprise
 */

import { EventBus } from '../EventBus';
import { uid } from '../StateStore';
import {
  AppEvents,
  type ExtendedUserProfile,
  type SyncStatus,
  type UserProfile,
} from '../Types';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { RemoteDatabaseAdapter } from './RemoteDatabaseAdapter';

export type ProfileChangeListener = (profile: ExtendedUserProfile) => void;

class HybridStorageAdapterImpl {
  private status: SyncStatus = 'unknown';
  private listeners = new Set<ProfileChangeListener>();

  getSyncStatus(): SyncStatus {
    return this.status;
  }

  onProfileChange(fn: ProfileChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emitProfile(profile: ExtendedUserProfile): void {
    this.listeners.forEach((fn) => {
      try {
        fn(profile);
      } catch (e) {
        console.error('[HybridStorage] listener error', e);
      }
    });
    EventBus.publish(AppEvents.PROFILE_UPDATED, { profile });
    EventBus.publish(AppEvents.AUTH_PROFILE_UPDATED, { profile });
  }

  private setStatus(status: SyncStatus, extra?: Record<string, unknown>): void {
    this.status = status;
    EventBus.publish(AppEvents.PROFILE_SYNC_STATUS, { status, ...extra });
  }

  /**
   * Fast-Read : LocalStorage immédiat.
   * Background : compare remote updatedAt (Last-Write-Wins).
   */
  async getUserProfile(userId: string): Promise<ExtendedUserProfile | null> {
    const local = LocalStorageAdapter.getUserProfileSync(userId);

    // Background remote check (ne bloque pas le premier paint)
    void this.reconcileInBackground(userId, local);

    if (local) {
      if (local.pendingSync) this.setStatus('pending', { userId });
      else if (!RemoteDatabaseAdapter.isOnline()) this.setStatus('offline', { userId });
      else this.setStatus('synced', { userId });
      return local;
    }

    // Pas de cache → tente remote
    if (!RemoteDatabaseAdapter.isOnline()) {
      this.setStatus('offline', { userId });
      return null;
    }

    try {
      this.setStatus('syncing', { userId });
      const remote = await RemoteDatabaseAdapter.getUserProfile(userId);
      if (remote) {
        const cached: ExtendedUserProfile = {
          ...remote,
          pendingSync: false,
          lastSyncedAt: new Date().toISOString(),
          lastWriteSource: 'remote',
        };
        await LocalStorageAdapter.saveUserProfile(cached, { pendingSync: false });
        this.setStatus('synced', { userId });
        return cached;
      }
      this.setStatus('synced', { userId });
      return null;
    } catch {
      this.setStatus('offline', { userId });
      return null;
    }
  }

  /** Lecture sync pure (UI bootstrap) */
  getUserProfileFast(userId: string): ExtendedUserProfile | null {
    return LocalStorageAdapter.getUserProfileSync(userId);
  }

  /**
   * Dual-Write :
   * 1. Local immédiat (updatedAt now)
   * 2. Remote async — échec → queue + pendingSync
   */
  async saveUserProfile(
    profile: UserProfile | ExtendedUserProfile
  ): Promise<ExtendedUserProfile> {
    const now = new Date().toISOString();
    const base = LocalStorageAdapter.fromUserProfile(profile as UserProfile, {
      updatedAt: now,
      lastSyncedAt:
        'lastSyncedAt' in profile
          ? (profile as ExtendedUserProfile).lastSyncedAt
          : null,
      pendingSync: true,
      lastWriteSource: 'local',
    });

    // Write locale immédiate
    await LocalStorageAdapter.saveUserProfile(base, { pendingSync: true });
    this.emitProfile(base);

    if (!RemoteDatabaseAdapter.isOnline()) {
      LocalStorageAdapter.enqueueSync(base);
      this.setStatus('offline', { userId: base.id });
      return base;
    }

    try {
      this.setStatus('syncing', { userId: base.id });
      await RemoteDatabaseAdapter.saveUserProfile(base);
      const synced: ExtendedUserProfile = {
        ...base,
        pendingSync: false,
        lastSyncedAt: new Date().toISOString(),
        lastWriteSource: 'remote',
      };
      await LocalStorageAdapter.saveUserProfile(synced, { pendingSync: false });
      LocalStorageAdapter.dequeueUser(base.id);
      this.setStatus('synced', { userId: base.id });
      this.emitProfile(synced);
      EventBus.publish(AppEvents.PROFILE_SYNCED, { profile: synced });
      return synced;
    } catch {
      LocalStorageAdapter.enqueueSync(base);
      this.setStatus('pending', { userId: base.id });
      EventBus.publish(AppEvents.PROFILE_SYNC_ERROR, {
        userId: base.id,
        reason: 'dual_write_failed',
      });
      return base;
    }
  }

  /**
   * Last-Write-Wins entre local et remote.
   */
  private async reconcileInBackground(
    userId: string,
    local: ExtendedUserProfile | null
  ): Promise<void> {
    if (!RemoteDatabaseAdapter.isOnline()) return;
    try {
      const remote = await RemoteDatabaseAdapter.getUserProfile(userId);
      if (!remote && !local) return;

      if (!remote && local?.pendingSync) {
        // Push local
        await this.flushProfile(local);
        return;
      }

      if (remote && !local) {
        const cached: ExtendedUserProfile = {
          ...remote,
          pendingSync: false,
          lastSyncedAt: new Date().toISOString(),
          lastWriteSource: 'remote',
        };
        await LocalStorageAdapter.saveUserProfile(cached, { pendingSync: false });
        this.emitProfile(cached);
        this.setStatus('synced', { userId });
        return;
      }

      if (remote && local) {
        const localT = new Date(local.updatedAt).getTime();
        const remoteT = new Date(remote.updatedAt).getTime();

        if (local.pendingSync && localT >= remoteT) {
          await this.flushProfile(local);
          return;
        }

        if (remoteT > localT) {
          // Remote gagne
          const cached: ExtendedUserProfile = {
            ...remote,
            pendingSync: false,
            lastSyncedAt: new Date().toISOString(),
            lastWriteSource: 'remote',
          };
          await LocalStorageAdapter.saveUserProfile(cached, {
            pendingSync: false,
          });
          LocalStorageAdapter.dequeueUser(userId);
          this.emitProfile(cached);
          this.setStatus('synced', { userId });
          return;
        }

        if (local.pendingSync) {
          await this.flushProfile(local);
        } else {
          this.setStatus('synced', { userId });
        }
      }
    } catch {
      /* silencieux en background */
    }
  }

  private async flushProfile(
    profile: ExtendedUserProfile
  ): Promise<boolean> {
    try {
      this.setStatus('syncing', { userId: profile.id });
      await RemoteDatabaseAdapter.saveUserProfile(profile);
      const synced: ExtendedUserProfile = {
        ...profile,
        pendingSync: false,
        lastSyncedAt: new Date().toISOString(),
        lastWriteSource: 'remote',
      };
      await LocalStorageAdapter.saveUserProfile(synced, { pendingSync: false });
      LocalStorageAdapter.dequeueUser(profile.id);
      this.setStatus('synced', { userId: profile.id });
      this.emitProfile(synced);
      EventBus.publish(AppEvents.PROFILE_SYNCED, { profile: synced });
      return true;
    } catch {
      this.setStatus(
        RemoteDatabaseAdapter.isOnline() ? 'error' : 'pending',
        { userId: profile.id }
      );
      return false;
    }
  }

  /** Force push queue + profil courant */
  async forceSync(userId: string): Promise<boolean> {
    if (!RemoteDatabaseAdapter.isOnline()) {
      this.setStatus('offline', { userId });
      EventBus.publish(AppEvents.TOAST_SHOW, {
        id: uid('toast'),
        type: 'warning',
        title: 'Hors-ligne',
        description: 'Impossible de synchroniser sans réseau',
        duration: 2800,
      });
      return false;
    }

    const local = LocalStorageAdapter.getUserProfileSync(userId);
    if (local) {
      const ok = await this.flushProfile(local);
      if (ok) {
        EventBus.publish(AppEvents.TOAST_SHOW, {
          id: uid('toast'),
          type: 'success',
          title: 'Synchronisé',
          description: 'Profil à jour sur le serveur distant',
          duration: 2400,
        });
      }
      return ok;
    }

    // Tente pull
    try {
      const remote = await RemoteDatabaseAdapter.getUserProfile(userId);
      if (remote) {
        const cached: ExtendedUserProfile = {
          ...remote,
          pendingSync: false,
          lastSyncedAt: new Date().toISOString(),
          lastWriteSource: 'remote',
        };
        await LocalStorageAdapter.saveUserProfile(cached, { pendingSync: false });
        this.emitProfile(cached);
        this.setStatus('synced', { userId });
        return true;
      }
    } catch {
      this.setStatus('error', { userId });
    }
    return false;
  }
}

export const HybridStorageAdapter = new HybridStorageAdapterImpl();
export default HybridStorageAdapter;
