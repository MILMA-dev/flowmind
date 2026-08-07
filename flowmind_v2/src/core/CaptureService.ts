/**
 * FlowMind — CaptureService
 * CRUD réactif des BrainDumpItems via EventBus
 * Équipe MILMA Entreprise
 */

import { EventBus } from './EventBus';
import { StateStore, uid } from './StateStore';
import { AppEvents, type BrainDumpItem, type CapturePriority } from './Types';
import { parseCaptureInput } from './textParse';

export interface AddCaptureOptions {
  source?: BrainDumpItem['source'];
  priority?: CapturePriority;
  tags?: string[];
}

class CaptureServiceImpl {
  private registered = false;

  register(): void {
    if (this.registered) return;
    this.registered = true;

    EventBus.subscribe('ADD_CAPTURE_REQUESTED', (payload) => {
      const p = payload as { content: string; options?: AddCaptureOptions };
      if (p?.content?.trim()) {
        this.add(p.content, p.options);
      }
    });

    EventBus.subscribe('UPDATE_CAPTURE_REQUESTED', (payload) => {
      const p = payload as { id: string; content: string };
      if (p?.id && typeof p.content === 'string') {
        this.update(p.id, p.content);
      }
    });

    EventBus.subscribe('REMOVE_CAPTURE_REQUESTED', (payload) => {
      const p = payload as { id: string };
      if (p?.id) this.remove(p.id);
    });

    EventBus.subscribe('ARCHIVE_CAPTURE_REQUESTED', (payload) => {
      const p = payload as { id: string };
      if (p?.id) this.archive(p.id);
    });
  }

  /** Ajoute une Capture Unit dans l'Inbox */
  add(rawContent: string, options: AddCaptureOptions = {}): BrainDumpItem | null {
    const content = rawContent.trim();
    if (!content) return null;

    const parsed = parseCaptureInput(content);
    const now = new Date().toISOString();
    const tags = Array.from(
      new Set([...(options.tags ?? []), ...parsed.tags])
    );

    const item: BrainDumpItem = {
      id: uid('cap'),
      content: parsed.content,
      plainText: parsed.plainText,
      status: 'raw',
      route: null,
      routedToId: null,
      tags,
      priority: options.priority && options.priority !== 'none'
        ? options.priority
        : parsed.priority,
      createdAt: now,
      updatedAt: now,
      processedAt: null,
      source: options.source ?? 'inbox',
    };

    StateStore.addCapture(item);
    EventBus.publish(AppEvents.CAPTURE_ADDED, { item });
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type: 'success',
      title: 'Pensée capturée',
      description: parsed.title.slice(0, 60),
      duration: 2200,
    });

    return item;
  }

  update(id: string, rawContent: string): BrainDumpItem | null {
    const content = rawContent.trim();
    if (!content) return null;

    const existing = StateStore.getState().captures.find((c) => c.id === id);
    if (!existing) return null;

    const parsed = parseCaptureInput(content);
    const updated: BrainDumpItem = {
      ...existing,
      content: parsed.content,
      plainText: parsed.plainText,
      tags: parsed.tags,
      priority: parsed.priority === 'none' ? existing.priority : parsed.priority,
      updatedAt: new Date().toISOString(),
    };

    StateStore.updateCapture(updated);
    EventBus.publish(AppEvents.CAPTURE_UPDATED, { item: updated });
    return updated;
  }

  remove(id: string): void {
    const existing = StateStore.getState().captures.find((c) => c.id === id);
    if (!existing) return;
    StateStore.removeCapture(id);
    EventBus.publish(AppEvents.CAPTURE_REMOVED, { id, item: existing });
  }

  archive(id: string): void {
    const existing = StateStore.getState().captures.find((c) => c.id === id);
    if (!existing) return;
    const updated: BrainDumpItem = {
      ...existing,
      status: 'archived',
      updatedAt: new Date().toISOString(),
      processedAt: new Date().toISOString(),
    };
    StateStore.updateCapture(updated);
    EventBus.publish(AppEvents.CAPTURE_UPDATED, { item: updated });
  }
}

export const CaptureService = new CaptureServiceImpl();
export default CaptureService;
