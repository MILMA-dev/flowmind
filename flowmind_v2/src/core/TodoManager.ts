/**
 * FlowMind — TodoManager
 * Listes d'Unités d'Action multi-projets + statistiques
 * Équipe MILMA Entreprise
 *
 * Terminologie : Listes d'Action / Unités — pas "todo list classique"
 */

import { EventBus } from './EventBus';
import { StateStore, uid } from './StateStore';
import {
  AppEvents,
  type Task,
  type TodoItem,
  type TodoList,
} from './Types';

const LIST_COLORS = [
  '#6366f1',
  '#22d3ee',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#fb923c',
];

export function listProgress(list: TodoList): number {
  if (!list.items.length) return 0;
  const done = list.items.filter((i) => i.isCompleted).length;
  return Math.round((done / list.items.length) * 100);
}

export function listStats(list: TodoList) {
  const total = list.items.length;
  const done = list.items.filter((i) => i.isCompleted).length;
  const overdue = list.items.filter((i) => {
    if (i.isCompleted || !i.dueDate) return false;
    return new Date(i.dueDate).getTime() < Date.now();
  }).length;
  return { total, done, remaining: total - done, overdue, progress: listProgress(list) };
}

class TodoManagerImpl {
  private registered = false;

  register(): void {
    if (this.registered) return;
    this.registered = true;

    // Sync : tâches converties depuis Brain Dump → liste Inbox Actions
    EventBus.subscribe(AppEvents.TASK_CREATED, (payload) => {
      const p = payload as { task?: Task };
      if (!p?.task) return;
      this.ensureInboxList();
      const lists = this.getLists();
      const inbox = lists.find((l) => l.category === 'Inbox') ?? lists[0];
      if (!inbox) return;
      // Évite doublon si déjà présent
      if (inbox.items.some((i) => i.text === p.task!.title)) return;
      this.addItem(inbox.id, {
        text: p.task.title,
        priority:
          p.task.priority === 'critical'
            ? 'high'
            : p.task.priority === 'low'
              ? 'low'
              : 'medium',
        dueDate: p.task.dueDate,
      });
    });
  }

  getLists(): TodoList[] {
    return StateStore.getState().todoLists;
  }

  getList(id: string): TodoList | null {
    return this.getLists().find((l) => l.id === id) ?? null;
  }

  createList(partial: Partial<TodoList> = {}): TodoList {
    const now = new Date().toISOString();
    const idx = this.getLists().length;
    const list: TodoList = {
      id: uid('tlist'),
      title: partial.title?.trim() || `Liste ${idx + 1}`,
      category: partial.category?.trim() || 'Général',
      color: partial.color || LIST_COLORS[idx % LIST_COLORS.length],
      items: partial.items ?? [],
      createdAt: now,
      updatedAt: now,
    };
    StateStore.addTodoList(list);
    EventBus.publish(AppEvents.TODO_LIST_CREATED, { list });
    return list;
  }

  saveList(list: TodoList): TodoList {
    const updated = { ...list, updatedAt: new Date().toISOString() };
    StateStore.updateTodoList(updated);
    EventBus.publish(AppEvents.TODO_LIST_UPDATED, { list: updated });
    return updated;
  }

  deleteList(id: string): void {
    const list = this.getList(id);
    if (!list) return;
    StateStore.removeTodoList(id);
    EventBus.publish(AppEvents.TODO_LIST_DELETED, { id, list });
  }

  renameList(id: string, title: string): void {
    const list = this.getList(id);
    if (!list || !title.trim()) return;
    this.saveList({ ...list, title: title.trim() });
  }

  setCategory(id: string, category: string): void {
    const list = this.getList(id);
    if (!list) return;
    this.saveList({ ...list, category: category.trim() || 'Général' });
  }

  addItem(
    listId: string,
    partial: Partial<Pick<TodoItem, 'text' | 'priority' | 'dueDate'>> & {
      text?: string;
    }
  ): TodoItem | null {
    const list = this.getList(listId);
    if (!list) return null;
    const now = new Date().toISOString();
    const item: TodoItem = {
      id: uid('titem'),
      text: partial.text?.trim() || 'Nouvelle unité',
      isCompleted: false,
      priority: partial.priority ?? 'medium',
      dueDate: partial.dueDate ?? null,
      createdAt: now,
      completedAt: null,
    };
    const updated = this.saveList({
      ...list,
      items: [...list.items, item],
    });
    EventBus.publish(AppEvents.TODO_ITEM_ADDED, {
      listId,
      item,
      list: updated,
    });
    return item;
  }

  toggleItem(listId: string, itemId: string): void {
    const list = this.getList(listId);
    if (!list) return;
    const now = new Date().toISOString();
    const items = list.items.map((it) =>
      it.id === itemId
        ? {
            ...it,
            isCompleted: !it.isCompleted,
            completedAt: !it.isCompleted ? now : null,
          }
        : it
    );
    const updated = this.saveList({ ...list, items });
    const item = items.find((i) => i.id === itemId);
    EventBus.publish(AppEvents.TODO_ITEM_TOGGLED, {
      listId,
      itemId,
      item,
      list: updated,
      progress: listProgress(updated),
    });
  }

  updateItem(
    listId: string,
    itemId: string,
    patch: Partial<Pick<TodoItem, 'text' | 'priority' | 'dueDate'>>
  ): void {
    const list = this.getList(listId);
    if (!list) return;
    const items = list.items.map((it) =>
      it.id === itemId ? { ...it, ...patch } : it
    );
    this.saveList({ ...list, items });
  }

  removeItem(listId: string, itemId: string): void {
    const list = this.getList(listId);
    if (!list) return;
    this.saveList({
      ...list,
      items: list.items.filter((i) => i.id !== itemId),
    });
  }

  /** Filtre listes par catégorie / recherche */
  filterLists(opts: {
    category?: string | null;
    query?: string;
    hideCompletedLists?: boolean;
  }): TodoList[] {
    let lists = this.getLists();
    if (opts.category) {
      lists = lists.filter((l) => l.category === opts.category);
    }
    if (opts.query?.trim()) {
      const q = opts.query.trim().toLowerCase();
      lists = lists.filter(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.category.toLowerCase().includes(q) ||
          l.items.some((i) => i.text.toLowerCase().includes(q))
      );
    }
    if (opts.hideCompletedLists) {
      lists = lists.filter((l) => listProgress(l) < 100 || l.items.length === 0);
    }
    return lists;
  }

  categories(): string[] {
    const set = new Set(this.getLists().map((l) => l.category));
    return Array.from(set).sort();
  }

  ensureInboxList(): TodoList {
    const existing = this.getLists().find((l) => l.category === 'Inbox');
    if (existing) return existing;
    return this.createList({
      title: 'Inbox Actions',
      category: 'Inbox',
      color: '#6366f1',
    });
  }

  /** Seed démo si vide */
  seedIfEmpty(): void {
    if (this.getLists().length > 0) return;
    const a = this.createList({
      title: 'Focus semaine',
      category: 'Projets',
      color: '#818cf8',
    });
    this.addItem(a.id, { text: 'Clarifier les 3 priorités', priority: 'high' });
    this.addItem(a.id, { text: 'Revue Notes Dek', priority: 'medium' });
    this.addItem(a.id, {
      text: 'Planifier deep work',
      priority: 'high',
      dueDate: new Date(Date.now() + 86400000).toISOString(),
    });

    const b = this.createList({
      title: 'Personnel',
      category: 'Vie',
      color: '#22d3ee',
    });
    this.addItem(b.id, { text: 'Sport 30 min', priority: 'medium' });
    this.addItem(b.id, { text: 'Lecture 20 pages', priority: 'low' });
  }
}

export const TodoManager = new TodoManagerImpl();
export default TodoManager;
