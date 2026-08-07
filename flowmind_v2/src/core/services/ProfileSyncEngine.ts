/**
 * ProfileSyncEngine — sync background, online/offline, flush queue
 * Équipe MILMA Entreprise
 */

import { EventBus } from '../EventBus';
import { AppEvents } from '../Types';
import { HybridStorageAdapter } from '../storage/HybridStorageAdapter';
import { LocalStorageAdapter } from '../storage/LocalStorageAdapter';
import { RemoteDatabaseAdapter } from '../storage/RemoteDatabaseAdapter';
import { AuthService } from '../AuthService';

class ProfileSyncEngineImpl {
  private started = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private currentUserId: string | null = null;

  start(userId?: string | null): void {
    if (userId) this.currentUserId = userId;

    if (!this.started) {
      this.started = true;
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);

      // Tick périodique (file d'attente)
      this.flushTimer = setInterval(() => {
        void this.flushPendingSyncQueue();
      }, 45_000);
    }

    // Sync initiale si user connu
    if (this.currentUserId) {
      void HybridStorageAdapter.getUserProfile(this.currentUserId);
      if (RemoteDatabaseAdapter.isOnline()) {
        void this.flushPendingSyncQueue();
      } else {
        EventBus.publish(AppEvents.PROFILE_SYNC_STATUS, {
          status: 'offline',
          userId: this.currentUserId,
        });
      }
    }
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  setUser(userId: string | null): void {
    this.currentUserId = userId;
    if (userId) {
      void HybridStorageAdapter.getUserProfile(userId);
      void this.flushPendingSyncQueue();
    }
  }

  private onOnline = (): void => {
    EventBus.publish(AppEvents.NETWORK_ONLINE, {
      at: new Date().toISOString(),
    });
    EventBus.publish(AppEvents.PROFILE_SYNC_STATUS, {
      status: 'syncing',
      userId: this.currentUserId,
    });
    void this.flushPendingSyncQueue();
    if (this.currentUserId) {
      void HybridStorageAdapter.getUserProfile(this.currentUserId);
    }
  };

  private onOffline = (): void => {
    EventBus.publish(AppEvents.NETWORK_OFFLINE, {
      at: new Date().toISOString(),
    });
    EventBus.publish(AppEvents.PROFILE_SYNC_STATUS, {
      status: 'offline',
      userId: this.currentUserId,
    });
  };

  /**
   * Dépile flowmind_sync_queue et pousse vers le remote.
   */
  async flushPendingSyncQueue(): Promise<{
    flushed: number;
    failed: number;
  }> {
    if (!RemoteDatabaseAdapter.isOnline()) {
      return { flushed: 0, failed: 0 };
    }

    const queue = LocalStorageAdapter.getSyncQueue();
    if (queue.length === 0) {
      // Profil courant pending ?
      if (this.currentUserId) {
        const local = LocalStorageAdapter.getUserProfileSync(this.currentUserId);
        if (local?.pendingSync) {
          const ok = await HybridStorageAdapter.forceSync(this.currentUserId);
          return { flushed: ok ? 1 : 0, failed: ok ? 0 : 1 };
        }
      }
      return { flushed: 0, failed: 0 };
    }

    let flushed = 0;
    let failed = 0;
    const remaining = [];

    for (const item of queue) {
      try {
        EventBus.publish(AppEvents.PROFILE_SYNC_STATUS, {
          status: 'syncing',
          userId: item.userId,
        });
        await RemoteDatabaseAdapter.saveUserProfile(item.profile);
        const synced = {
          ...item.profile,
          pendingSync: false,
          lastSyncedAt: new Date().toISOString(),
          lastWriteSource: 'remote' as const,
        };
        await LocalStorageAdapter.saveUserProfile(synced, {
          pendingSync: false,
        });
        EventBus.publish(AppEvents.PROFILE_SYNCED, { profile: synced });
        EventBus.publish(AppEvents.PROFILE_UPDATED, { profile: synced });
        flushed += 1;
      } catch {
        failed += 1;
        remaining.push({
          ...item,
          attempts: item.attempts + 1,
        });
      }
    }

    LocalStorageAdapter.setSyncQueue(
      remaining.filter((r) => r.attempts < 8)
    );

    if (flushed > 0 && failed === 0) {
      EventBus.publish(AppEvents.PROFILE_SYNC_STATUS, {
        status: 'synced',
        userId: this.currentUserId,
      });
    } else if (failed > 0) {
      EventBus.publish(AppEvents.PROFILE_SYNC_STATUS, {
        status: remaining.length ? 'pending' : 'error',
        userId: this.currentUserId,
      });
    }

    return { flushed, failed };
  }

  /** Sync au login */
  async syncOnLogin(userId: string): Promise<void> {
    this.currentUserId = userId;
    await HybridStorageAdapter.getUserProfile(userId);
    await this.flushPendingSyncQueue();
  }

  /** Force depuis UI */
  async forceSyncNow(): Promise<boolean> {
    const uid =
      this.currentUserId || AuthService.getUser()?.id || null;
    if (!uid) return false;
    await this.flushPendingSyncQueue();
    return HybridStorageAdapter.forceSync(uid);
  }
}

export const ProfileSyncEngine = new ProfileSyncEngineImpl();
export default ProfileSyncEngine;
