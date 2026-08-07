/**
 * FlowMind — StorageRepository
 * LocalStorage scopé par compte (ScopeManager) + Miroir Réplica Haute-Performance Dexie.js (IndexedDB)
 * Équipe MILMA Entreprise
 */

import type { AppState } from '../core/Types';
import { ScopeManager } from '../core/storage/ScopeManager';
import { db } from '../core/storage/IndexedDBAdapter';
import { OfflineMutationQueue } from '../core/storage/OfflineMutationQueue';

export interface StorageMeta {
  lastSavedAt: string | null;
  version: number;
  bytes: number;
}

export const HYBRID_STORAGE_HINT = {
  appState: 'scoped localStorage via ScopeManager + Dexie.js Mirroring',
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
    const { key, metaKey } = this.resolveKeys();
    const payload = JSON.stringify(state);

    // 1. Sauvegarde synchrone locale (LocalStorage)
    localStorage.setItem(key, payload);
    const meta: StorageMeta = {
      lastSavedAt: new Date().toISOString(),
      version: state.version,
      bytes: payload.length,
    };
    localStorage.setItem(metaKey, JSON.stringify(meta));

    // 2. Synchronisation et réplication asynchrone vers Dexie.js (IndexedDB) + File d'attente hors-ligne
    try {
      const userId = ScopeManager.getUserId() || 'guest';
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

      // Réplication des Notes
      if (state.notes) {
        for (const note of state.notes) {
          const existing = await db.notes.get(note.id);
          const isNewer = !existing || new Date(note.updatedAt || 0).getTime() > new Date(existing.updatedAt || 0).getTime();

          if (isNewer) {
            const isDirtyVal = !isOnline ? 1 : 0;
            const record = {
              id: note.id,
              userId,
              title: note.title,
              content: note.content,
              folderId: note.folderId,
              tags: JSON.stringify(note.tags || []),
              pinned: note.pinned ? 1 : 0,
              isArchived: note.isArchived ? 1 : 0,
              createdAt: note.createdAt,
              updatedAt: note.updatedAt,
              deletedAt: null,
              syncedAt: isOnline ? new Date().toISOString() : null,
              isDirty: isDirtyVal,
              _fieldUpdates: JSON.stringify((note as any)._fieldUpdates || {}),
            };
            await db.notes.put(record);

            if (!isOnline) {
              // Enregistre l'action hors-ligne pour la rejouer lors de la reconnexion
              await OfflineMutationQueue.enqueue(userId, 'note', note.id, 'UPDATE', record);
            }
          }
        }
      }

      // Réplication des Todos
      if (state.tasks) {
        for (const todo of state.tasks) {
          const existing = await db.todos.get(todo.id);
          const isNewer = !existing || new Date(todo.updatedAt || 0).getTime() > new Date(existing.updatedAt || 0).getTime();

          if (isNewer) {
            const isDirtyVal = !isOnline ? 1 : 0;
            const record = {
              id: todo.id,
              userId,
              title: todo.title,
              description: todo.description,
              status: todo.status,
              priority: todo.priority,
              dueDate: todo.dueDate,
              listId: todo.projectId,
              listName: null,
              tags: JSON.stringify(todo.tags || []),
              completedAt: todo.completedAt,
              createdAt: todo.createdAt,
              updatedAt: todo.updatedAt,
              deletedAt: null,
              syncedAt: isOnline ? new Date().toISOString() : null,
              isDirty: isDirtyVal,
              _fieldUpdates: JSON.stringify((todo as any)._fieldUpdates || {}),
            };
            await db.todos.put(record);

            if (!isOnline) {
              await OfflineMutationQueue.enqueue(userId, 'todo', todo.id, 'UPDATE', record);
            }
          }
        }
      }

      // Réplication des Événements Calendrier
      if (state.events) {
        for (const event of state.events) {
          const existing = await db.calendarEvents.get(event.id);
          const eventUpdated = event.updatedAt || event.createdAt;
          const isNewer = !existing || new Date(eventUpdated || 0).getTime() > new Date(existing.updatedAt || 0).getTime();

          if (isNewer) {
            const isDirtyVal = !isOnline ? 1 : 0;
            const record = {
              id: event.id,
              userId,
              title: event.title,
              description: event.description,
              start: event.start || event.startDate || '',
              end: event.end || event.endDate || '',
              allDay: (event.allDay || event.isAllDay) ? 1 : 0,
              color: event.color,
              linkedTaskId: event.linkedTaskId,
              linkedNoteId: event.linkedNoteId,
              linkedNodeId: event.linkedNodeId,
              linkedWorkflowId: event.linkedWorkflowId,
              triggerFiredAt: event.triggerFiredAt,
              createdAt: event.createdAt,
              updatedAt: eventUpdated,
              deletedAt: null,
              syncedAt: isOnline ? new Date().toISOString() : null,
              isDirty: isDirtyVal,
              _fieldUpdates: JSON.stringify((event as any)._fieldUpdates || {}),
            };
            await db.calendarEvents.put(record);

            if (!isOnline) {
              await OfflineMutationQueue.enqueue(userId, 'calendarEvent', event.id, 'UPDATE', record);
            }
          }
        }
      }

      // Réplication des Workflows
      if (state.workflows) {
        for (const wf of state.workflows) {
          const existing = await db.workflows.get(wf.id);
          const isNewer = !existing || new Date(wf.updatedAt || 0).getTime() > new Date(existing.updatedAt || 0).getTime();

          if (isNewer) {
            const isDirtyVal = !isOnline ? 1 : 0;
            const record = {
              id: wf.id,
              userId,
              title: wf.title,
              description: wf.description,
              status: wf.runStatus || 'DRAFT',
              tags: JSON.stringify(wf.tags || []),
              color: wf.color,
              runStatus: wf.runStatus || null,
              lastRunAt: wf.lastRunAt || null,
              viewport: JSON.stringify(wf.viewport || {}),
              createdAt: wf.createdAt,
              updatedAt: wf.updatedAt,
              deletedAt: null,
              syncedAt: isOnline ? new Date().toISOString() : null,
              isDirty: isDirtyVal,
              _fieldUpdates: JSON.stringify((wf as any)._fieldUpdates || {}),
            };
            await db.workflows.put(record);

            if (!isOnline) {
              await OfflineMutationQueue.enqueue(userId, 'workflow', wf.id, 'UPDATE', record);
            }
          }
        }
      }
    } catch (err) {
      console.warn('[StorageRepository] Échec de la réplication vers Dexie.js (IndexedDB) :', err);
    }

    return meta;
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
