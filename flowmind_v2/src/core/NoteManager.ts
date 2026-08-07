/**
 * FlowMind — NoteManager
 * CRUD Notes Dek, auto-save debounce, recherche full-text
 * Équipe MILMA Entreprise
 */

import { EventBus } from './EventBus';
import { StateStore, uid } from './StateStore';
import { AppEvents, type Note } from './Types';

const AUTOSAVE_MS = 500;

class NoteManagerImpl {
  private registered = false;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private pending = new Map<string, Partial<Note>>();

  register(): void {
    if (this.registered) return;
    this.registered = true;

    EventBus.subscribe(AppEvents.CREATE_NOTE_REQUESTED, (payload) => {
      const p = payload as { note?: Note; title?: string; content?: string };
      // ConversionService ajoute déjà via addNote — ignorer si note fournie
      if (p?.note) return;
      if (p?.title || p?.content) {
        this.create({ title: p.title, content: p.content });
      }
    });
  }

  getNotes(includeArchived = false): Note[] {
    const notes = StateStore.getState().notes;
    return includeArchived ? notes : notes.filter((n) => !n.isArchived);
  }

  getNote(id: string): Note | null {
    return StateStore.getState().notes.find((n) => n.id === id) ?? null;
  }

  create(partial: Partial<Note> = {}): Note {
    const now = new Date().toISOString();
    const note: Note = {
      id: uid('note'),
      title: partial.title?.trim() || 'Sans titre',
      content: partial.content ?? '',
      folderId: partial.folderId ?? 'folder_inbox',
      tags: partial.tags ?? [],
      pinned: partial.pinned ?? false,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };
    StateStore.addNote(note);
    EventBus.publish(AppEvents.NOTE_CREATED, { note });
    EventBus.publish(AppEvents.NOTE_UPDATED, {
      notes: StateStore.getState().notes,
    });
    return note;
  }

  /**
   * Sauvegarde immédiate (sans debounce)
   */
  saveNote(note: Note): Note {
    const updated: Note = {
      ...note,
      updatedAt: new Date().toISOString(),
    };
    StateStore.updateNote(updated);
    EventBus.publish(AppEvents.NOTE_UPDATED, {
      note: updated,
      notes: StateStore.getState().notes,
    });
    return updated;
  }

  /**
   * Patch avec auto-save debounced 500ms
   */
  updateDebounced(id: string, patch: Partial<Note>): void {
    const existing = this.getNote(id);
    if (!existing) return;

    const merged = { ...this.pending.get(id), ...patch };
    this.pending.set(id, merged);

    // Optimistic UI immédiat
    const optimistic: Note = {
      ...existing,
      ...merged,
      updatedAt: new Date().toISOString(),
    };
    StateStore.updateNote(optimistic);

    const prev = this.timers.get(id);
    if (prev) clearTimeout(prev);

    this.timers.set(
      id,
      setTimeout(() => {
        this.timers.delete(id);
        const p = this.pending.get(id);
        this.pending.delete(id);
        if (!p) return;
        const current = this.getNote(id);
        if (!current) return;
        const saved = this.saveNote({ ...current, ...p });
        EventBus.publish(AppEvents.NOTE_UPDATED, { note: saved, autosave: true });
      }, AUTOSAVE_MS)
    );
  }

  /** Flush tous les autosaves en attente */
  flush(): void {
    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
      this.timers.delete(id);
      const p = this.pending.get(id);
      this.pending.delete(id);
      const current = this.getNote(id);
      if (current && p) this.saveNote({ ...current, ...p });
    }
  }

  deleteNote(id: string): void {
    const note = this.getNote(id);
    if (!note) return;
    const t = this.timers.get(id);
    if (t) clearTimeout(t);
    this.timers.delete(id);
    this.pending.delete(id);
    StateStore.removeNote(id);
    EventBus.publish(AppEvents.NOTE_DELETED, { id, note });
    EventBus.publish(AppEvents.NOTE_UPDATED, {
      notes: StateStore.getState().notes,
    });
  }

  togglePin(id: string): void {
    const note = this.getNote(id);
    if (!note) return;
    this.saveNote({ ...note, pinned: !note.pinned });
  }

  toggleArchive(id: string): void {
    const note = this.getNote(id);
    if (!note) return;
    this.saveNote({ ...note, isArchived: !note.isArchived });
  }

  setTags(id: string, tags: string[]): void {
    const note = this.getNote(id);
    if (!note) return;
    this.saveNote({
      ...note,
      tags: Array.from(new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))),
    });
  }

  /**
   * Recherche full-text titre + contenu + tags
   */
  searchNotes(query: string, tag?: string | null, opts?: { archived?: boolean }): Note[] {
    const q = query.trim().toLowerCase();
    let list = this.getNotes(opts?.archived ?? false);

    if (tag) {
      list = list.filter((n) => n.tags.includes(tag.toLowerCase()));
    }
    if (!q) {
      return this.sortNotes(list);
    }

    return this.sortNotes(
      list.filter((n) => {
        const hay = `${n.title}\n${n.content}\n${n.tags.join(' ')}`.toLowerCase();
        return hay.includes(q);
      })
    );
  }

  allTags(): { tag: string; count: number }[] {
    const map = new Map<string, number>();
    for (const n of StateStore.getState().notes) {
      if (n.isArchived) continue;
      for (const t of n.tags) {
        map.set(t, (map.get(t) ?? 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  private sortNotes(notes: Note[]): Note[] {
    return [...notes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }
}

export const NoteManager = new NoteManagerImpl();
export default NoteManager;
