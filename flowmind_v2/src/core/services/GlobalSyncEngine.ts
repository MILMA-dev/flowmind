/**
 * GlobalSyncEngine — multi-appareils, multi-entités
 * Pull snapshot au login · Dual-write · Realtime (BroadcastChannel + storage events)
 * Équipe MILMA Entreprise
 */

import { EventBus } from '../EventBus';
import { StateStore, createInitialState, uid } from '../StateStore';
import { StorageRepository } from '../../infrastructure/StorageRepository';
import { ScopeManager } from '../storage/ScopeManager';
import { DataMerger } from '../storage/DataMerger';
import { RemoteDatabaseAdapter } from '../storage/RemoteDatabaseAdapter';
import { CloudRegistry } from '../storage/CloudRegistry';
import {
  AppEvents,
  type AppState,
  type EntitySnapshot,
  type GlobalSyncStatus,
  type SyncPayload,
} from '../Types';

const CLOUD_BUCKET = 'flowmind:remote-db:user-snapshots:v1';
const CHANNEL_NAME = 'flowmind-global-sync';

function getDeviceId(): string {
  const key = ScopeManager.deviceIdKey();
  let id = localStorage.getItem(key);
  if (!id) {
    id = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

function readCloudBucket(): Record<string, EntitySnapshot> {
  try {
    const raw = localStorage.getItem(CLOUD_BUCKET);
    return raw ? (JSON.parse(raw) as Record<string, EntitySnapshot>) : {};
  } catch {
    return {};
  }
}

function writeCloudBucket(all: Record<string, EntitySnapshot>): void {
  localStorage.setItem(CLOUD_BUCKET, JSON.stringify(all));
}

class GlobalSyncEngineImpl {
  private userId: string | null = null;
  private status: GlobalSyncStatus = 'idle';
  private deviceId = getDeviceId();
  private revision = 0;
  private channel: BroadcastChannel | null = null;
  private started = false;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubSaved: (() => void) | null = null;

  getStatus(): GlobalSyncStatus {
    return this.status;
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  getUserId(): string | null {
    return this.userId;
  }

  private setStatus(status: GlobalSyncStatus, extra?: Record<string, unknown>): void {
    this.status = status;
    EventBus.publish(AppEvents.GLOBAL_SYNC_STATUS, {
      status,
      userId: this.userId,
      deviceId: this.deviceId,
      ...extra,
    });
  }

  /**
   * Active le moteur pour un userId (après login).
   * 1. Switch scope storage
   * 2. Hydrate local scoped
   * 3. Pull cloud snapshot + merge LWW
   * 4. Subscribe realtime
   */
  async activateForUser(userId: string): Promise<void> {
    // Flush pending writes du scope précédent
    await StateStore.flush().catch(() => undefined);

    this.userId = userId;
    ScopeManager.switchTo(userId);

    // Reset RAM puis hydrate le scope user
    StateStore.reset();
    StateStore.rehydrateFromScope();

    this.setStatus('hydrating');
    await this.pullFullUserSnapshot(userId);

    this.subscribeToUserChanges(userId);
    this.bindLocalPush();
    this.started = true;

    // Push l'état local fusionné vers le cloud
    await this.pushFullSnapshot();
    this.setStatus(navigator.onLine ? 'synced' : 'offline');
  }

  /**
   * Déconnexion : push final, stop listeners, scope guest, reset RAM
   */
  async deactivate(): Promise<void> {
    if (this.userId && navigator.onLine) {
      await this.pushFullSnapshot().catch(() => undefined);
    }
    this.teardownRealtime();
    if (this.unsubSaved) {
      this.unsubSaved();
      this.unsubSaved = null;
    }
    await StateStore.flush().catch(() => undefined);

    this.userId = null;
    ScopeManager.switchToGuest();
    StateStore.reset();
    // Guest hydrate (souvent vide)
    StateStore.rehydrateFromScope();
    this.started = false;
    this.setStatus('idle');
  }

  /** Snapshot distant complet */
  async pullFullUserSnapshot(userId: string): Promise<EntitySnapshot | null> {
    try {
      let remote = this.readRemoteSnapshot(userId);

      // Cloud partagé multi-appareils (prioritaire)
      try {
        const cloudSnap = await CloudRegistry.getSnapshot(userId);
        if (cloudSnap?.state) {
          if (
            !remote ||
            (cloudSnap.revision ?? 0) >= (remote.revision ?? 0)
          ) {
            remote = cloudSnap;
          }
        }
      } catch (err) {
        console.warn('[GlobalSync] CloudRegistry pull failed', err);
      }

      // Endpoint HTTP optionnel
      if (RemoteDatabaseAdapter.isOnline()) {
        try {
          const cfg = RemoteDatabaseAdapter.getConfig();
          if (cfg.remoteEndpoint) {
            const res = await fetch(
              `${cfg.remoteEndpoint.replace(/\/$/, '')}/snapshots/${userId}`,
              { headers: { Accept: 'application/json' } }
            );
            if (res.ok) {
              remote = (await res.json()) as EntitySnapshot;
            }
          }
        } catch {
          /* keep cloud/local */
        }
      }

      if (!remote?.state) {
        return null;
      }

      const local = StateStore.getState();
      const merged = DataMerger.mergeAppStates(local, remote.state, {
        preferRemoteUI: false,
      });
      this.revision = Math.max(this.revision, remote.revision ?? 0);
      StateStore.replaceState(merged, { persist: true, path: 'cloud-pull' });

      EventBus.publish(AppEvents.GLOBAL_SYNC_PULLED, {
        userId,
        revision: remote.revision,
        fromDevice: remote.deviceId,
      });

      return remote;
    } catch (err) {
      console.warn('[GlobalSyncEngine] pull failed', err);
      this.setStatus('error');
      return null;
    }
  }

  /** Dual-write cloud */
  async pushFullSnapshot(): Promise<void> {
    if (!this.userId) return;
    if (!navigator.onLine) {
      this.setStatus('offline');
      this.enqueueOfflinePush();
      return;
    }

    this.setStatus('syncing');
    await StateStore.flush().catch(() => undefined);
    const state = StateStore.getState();
    this.revision += 1;

    const snapshot: EntitySnapshot = {
      userId: this.userId,
      version: state.version,
      updatedAt: new Date().toISOString(),
      state: this.sanitizeStateForCloud(state),
      deviceId: this.deviceId,
      revision: this.revision,
    };

    // Miroir local navigateur
    const bucket = readCloudBucket();
    bucket[this.userId] = snapshot;
    writeCloudBucket(bucket);
    try {
      localStorage.setItem(
        ScopeManager.cloudSnapshotKey(this.userId),
        JSON.stringify(snapshot)
      );
    } catch {
      /* quota */
    }

    // Cloud partagé (téléphone ↔ PC)
    try {
      await CloudRegistry.saveSnapshot(snapshot);
    } catch (err) {
      console.warn('[GlobalSync] CloudRegistry push failed', err);
      this.enqueueOfflinePush();
    }

    // HTTP optional
    try {
      const cfg = RemoteDatabaseAdapter.getConfig();
      if (cfg.remoteEndpoint && RemoteDatabaseAdapter.isOnline()) {
        await fetch(
          `${cfg.remoteEndpoint.replace(/\/$/, '')}/snapshots/${this.userId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(snapshot),
          }
        );
      }
    } catch {
      /* ignore */
    }

    // Realtime broadcast other tabs/devices (same origin)
    this.broadcast({
      type: 'full',
      userId: this.userId,
      deviceId: this.deviceId,
      revision: this.revision,
      updatedAt: snapshot.updatedAt,
      snapshot,
    });

    EventBus.publish(AppEvents.GLOBAL_SYNC_PUSHED, {
      userId: this.userId,
      revision: this.revision,
    });
    this.setStatus('synced');
  }

  /** Abonnement aux changements distants */
  subscribeToUserChanges(userId: string): void {
    this.teardownRealtime();

    // Multi-tab / multi-window même navigateur
    try {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (ev: MessageEvent<SyncPayload>) => {
        void this.onRemotePayload(ev.data);
      };
    } catch {
      this.channel = null;
    }

    // storage event (autres onglets)
    window.addEventListener('storage', this.onStorageEvent);

    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);

    void userId;
  }

  private teardownRealtime(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    window.removeEventListener('storage', this.onStorageEvent);
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
  }

  private onStorageEvent = (e: StorageEvent): void => {
    if (!this.userId) return;
    if (e.key !== CLOUD_BUCKET || !e.newValue) return;
    try {
      const all = JSON.parse(e.newValue) as Record<string, EntitySnapshot>;
      const snap = all[this.userId];
      if (!snap || snap.deviceId === this.deviceId) return;
      void this.applyRemoteSnapshot(snap);
    } catch {
      /* ignore */
    }
  };

  private onOnline = (): void => {
    EventBus.publish(AppEvents.NETWORK_ONLINE, {});
    void this.flushOfflineQueue();
    void this.pullFullUserSnapshot(this.userId!);
    this.setStatus('synced');
  };

  private onOffline = (): void => {
    EventBus.publish(AppEvents.NETWORK_OFFLINE, {});
    this.setStatus('offline');
  };

  private async onRemotePayload(payload: SyncPayload): Promise<void> {
    if (!payload || payload.userId !== this.userId) return;
    if (payload.deviceId === this.deviceId) return;
    if (payload.revision <= this.revision && payload.type !== 'full') return;

    if (payload.snapshot) {
      await this.applyRemoteSnapshot(payload.snapshot);
      return;
    }
    if (payload.entities) {
      const local = StateStore.getState();
      const partial = {
        ...createInitialState(),
        ...local,
        ...payload.entities,
      } as AppState;
      const merged = DataMerger.mergeAppStates(local, partial);
      this.revision = Math.max(this.revision, payload.revision);
      StateStore.replaceState(merged, { path: 'realtime-patch' });
      this.setStatus('multi_device');
      EventBus.publish(AppEvents.GLOBAL_SYNC_REMOTE_CHANGE, {
        fromDevice: payload.deviceId,
        revision: payload.revision,
      });
    }
  }

  private async applyRemoteSnapshot(snap: EntitySnapshot): Promise<void> {
    if (snap.deviceId === this.deviceId) return;
    const local = StateStore.getState();
    const merged = DataMerger.mergeAppStates(local, snap.state);
    this.revision = Math.max(this.revision, snap.revision);
    StateStore.replaceState(merged, { path: 'realtime-full' });
    this.setStatus('multi_device');
    EventBus.publish(AppEvents.GLOBAL_SYNC_REMOTE_CHANGE, {
      fromDevice: snap.deviceId,
      revision: snap.revision,
    });
    // Retour à synced après un court délai
    window.setTimeout(() => {
      if (this.status === 'multi_device') this.setStatus('synced');
    }, 2500);
  }

  private broadcast(payload: SyncPayload): void {
    try {
      this.channel?.postMessage(payload);
    } catch {
      /* ignore */
    }
  }

  private bindLocalPush(): void {
    if (this.unsubSaved) this.unsubSaved();
    this.unsubSaved = EventBus.subscribe(AppEvents.DATA_SAVED, () => {
      this.schedulePush();
    });
  }

  /** Debounce push cloud après mutations locales */
  private schedulePush(): void {
    if (!this.userId || !this.started) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      void this.pushFullSnapshot();
    }, 800);
  }

  private enqueueOfflinePush(): void {
    if (!this.userId) return;
    try {
      const key = ScopeManager.entityQueueKey(this.userId);
      const state = StateStore.getState();
      localStorage.setItem(
        key,
        JSON.stringify({
          userId: this.userId,
          state: this.sanitizeStateForCloud(state),
          enqueuedAt: new Date().toISOString(),
        })
      );
    } catch {
      /* quota */
    }
  }

  private async flushOfflineQueue(): Promise<void> {
    if (!this.userId) return;
    const key = ScopeManager.entityQueueKey(this.userId);
    const raw = localStorage.getItem(key);
    if (!raw) {
      await this.pushFullSnapshot();
      return;
    }
    try {
      localStorage.removeItem(key);
      await this.pushFullSnapshot();
    } catch {
      /* ignore */
    }
  }

  private readRemoteSnapshot(userId: string): EntitySnapshot | null {
    const bucket = readCloudBucket();
    if (bucket[userId]) return bucket[userId];
    try {
      const raw = localStorage.getItem(ScopeManager.cloudSnapshotKey(userId));
      return raw ? (JSON.parse(raw) as EntitySnapshot) : null;
    } catch {
      return null;
    }
  }

  private sanitizeStateForCloud(state: AppState): AppState {
    return {
      ...state,
      ui: {
        ...state.ui,
        quickCaptureOpen: false,
        settingsOpen: false,
        inspectorOpen: false,
        selectedNodeId: null,
        notesFocusMode: false,
      },
    };
  }

  /** Force sync manuel UI */
  async forceSyncNow(): Promise<void> {
    if (!this.userId) return;
    if (!navigator.onLine) {
      this.setStatus('offline');
      EventBus.publish(AppEvents.TOAST_SHOW, {
        id: uid('toast'),
        type: 'warning',
        title: 'Hors-ligne',
        description: 'Sync multi-appareils indisponible',
        duration: 2500,
      });
      return;
    }
    await this.pullFullUserSnapshot(this.userId);
    await this.pushFullSnapshot();
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type: 'success',
      title: 'Appareils synchronisés',
      description: 'Notes, workflows, tâches & calendrier',
      duration: 2500,
    });
  }
}

export const GlobalSyncEngine = new GlobalSyncEngineImpl();
export default GlobalSyncEngine;
