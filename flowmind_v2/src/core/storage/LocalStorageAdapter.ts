/**
 * LocalStorageAdapter — cache local profil + file d'attente sync
 * Fast-read / pendingSync flags
 */

import type {
  ExtendedUserProfile,
  SyncQueueItem,
  UserProfile,
} from '../Types';

const PROFILE_PREFIX = 'flowmind:hybrid:profile:';
const QUEUE_KEY = 'flowmind_sync_queue';
const META_PREFIX = 'flowmind:hybrid:meta:';

export interface LocalProfileMeta {
  pendingSync: boolean;
  lastSyncedAt: string | null;
  updatedAt: string;
}

class LocalStorageAdapterImpl {
  profileKey(userId: string): string {
    return `${PROFILE_PREFIX}${userId}`;
  }

  metaKey(userId: string): string {
    return `${META_PREFIX}${userId}`;
  }

  /** Lecture synchrone zero-latency */
  getUserProfileSync(userId: string): ExtendedUserProfile | null {
    try {
      const raw = localStorage.getItem(this.profileKey(userId));
      if (!raw) return null;
      return JSON.parse(raw) as ExtendedUserProfile;
    } catch {
      return null;
    }
  }

  async getUserProfile(userId: string): Promise<ExtendedUserProfile | null> {
    return this.getUserProfileSync(userId);
  }

  async saveUserProfile(
    profile: ExtendedUserProfile,
    opts?: { pendingSync?: boolean }
  ): Promise<void> {
    const pending =
      opts?.pendingSync !== undefined
        ? opts.pendingSync
        : profile.pendingSync;
    const next: ExtendedUserProfile = {
      ...profile,
      pendingSync: pending,
      updatedAt: profile.updatedAt || new Date().toISOString(),
    };
    localStorage.setItem(this.profileKey(profile.id), JSON.stringify(next));
    const meta: LocalProfileMeta = {
      pendingSync: next.pendingSync,
      lastSyncedAt: next.lastSyncedAt,
      updatedAt: next.updatedAt,
    };
    localStorage.setItem(this.metaKey(profile.id), JSON.stringify(meta));
  }

  getMeta(userId: string): LocalProfileMeta | null {
    try {
      const raw = localStorage.getItem(this.metaKey(userId));
      return raw ? (JSON.parse(raw) as LocalProfileMeta) : null;
    } catch {
      return null;
    }
  }

  /** File d'attente dual-write en échec réseau */
  getSyncQueue(): SyncQueueItem[] {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      return raw ? (JSON.parse(raw) as SyncQueueItem[]) : [];
    } catch {
      return [];
    }
  }

  setSyncQueue(queue: SyncQueueItem[]): void {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  enqueueSync(profile: ExtendedUserProfile): void {
    const queue = this.getSyncQueue().filter((q) => q.userId !== profile.id);
    queue.push({
      id: `sq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      userId: profile.id,
      profile,
      enqueuedAt: new Date().toISOString(),
      attempts: 0,
    });
    this.setSyncQueue(queue);
  }

  dequeueUser(userId: string): void {
    this.setSyncQueue(this.getSyncQueue().filter((q) => q.userId !== userId));
  }

  clearProfile(userId: string): void {
    localStorage.removeItem(this.profileKey(userId));
    localStorage.removeItem(this.metaKey(userId));
  }

  /** Construit un ExtendedUserProfile depuis un UserProfile basique */
  fromUserProfile(
    user: UserProfile,
    extras?: Partial<ExtendedUserProfile>
  ): ExtendedUserProfile {
    const now = new Date().toISOString();
    return {
      ...user,
      avatarUrl: user.avatarUrl ?? null,
      role: user.role ?? null,
      bio: user.bio ?? null,
      preferences: user.preferences,
      updatedAt: extras?.updatedAt ?? now,
      lastSyncedAt: extras?.lastSyncedAt ?? null,
      pendingSync: extras?.pendingSync ?? false,
      lastWriteSource: extras?.lastWriteSource ?? 'local',
    };
  }
}

export const LocalStorageAdapter = new LocalStorageAdapterImpl();
export default LocalStorageAdapter;
