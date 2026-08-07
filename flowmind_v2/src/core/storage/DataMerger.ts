/**
 * DataMerger — Fusion granulaire au niveau des champs (Field-Level Merging)
 * Basé sur une carte d'horodatages par propriété (_fieldUpdates).
 * Équipe MILMA Entreprise
 */

import type { AppState, Note, Task, TodoList, Workflow } from '../Types';
import type {
  Activity,
  BrainDumpItem,
  CalendarEvent,
  NoteFolder,
} from '../Types';

export type HasFieldUpdates = {
  id: string;
  updatedAt?: string;
  createdAt?: string;
  _fieldUpdates?: Record<string, string> | string; // Stocké sous forme d'objet ou de JSON stringifié en IndexedDB
};

/**
 * Normalise les métadonnées _fieldUpdates en objet de clés-valeurs d'horodatages.
 */
export function parseFieldUpdates(entity: HasFieldUpdates): Record<string, string> {
  if (!entity._fieldUpdates) return {};
  if (typeof entity._fieldUpdates === 'string') {
    try {
      return JSON.parse(entity._fieldUpdates) as Record<string, string>;
    } catch {
      return {};
    }
  }
  return entity._fieldUpdates;
}

/**
 * Fusionne deux entités au niveau individuel de chaque propriété (Field-Level Merging).
 * Compare chaque clé : en cas de conflit, conserve la valeur ayant l'horodatage le plus récent.
 */
export function mergeEntitiesFLM<T extends HasFieldUpdates>(local: T, remote: T): T {
  const localUpdates = parseFieldUpdates(local);
  const remoteUpdates = parseFieldUpdates(remote);

  const mergedUpdates: Record<string, string> = { ...localUpdates };
  const mergedEntity: Record<string, any> = { ...local };

  const allKeys = new Set([...Object.keys(local), ...Object.keys(remote)]);

  for (const key of allKeys) {
    if (key === 'id' || key === '_fieldUpdates') continue;

    const localTime = localUpdates[key] ? new Date(localUpdates[key]).getTime() : 0;
    const remoteTime = remoteUpdates[key] ? new Date(remoteUpdates[key]).getTime() : 0;

    if (remoteTime > localTime) {
      mergedEntity[key] = remote[key as keyof T];
      mergedUpdates[key] = remoteUpdates[key];
    } else if (localTime > remoteTime) {
      mergedEntity[key] = local[key as keyof T];
      mergedUpdates[key] = localUpdates[key];
    } else {
      // Si les horodatages individuels sont identiques, on utilise la valeur locale (ou non-undefined)
      if (remote[key as keyof T] !== undefined && local[key as keyof T] === undefined) {
        mergedEntity[key] = remote[key as keyof T];
      }
    }
  }

  mergedEntity._fieldUpdates = mergedUpdates;

  // Met à jour la date updatedAt globale à la plus récente
  const localGlobal = local.updatedAt ? new Date(local.updatedAt).getTime() : 0;
  const remoteGlobal = remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0;
  mergedEntity.updatedAt = localGlobal >= remoteGlobal
    ? local.updatedAt
    : remote.updatedAt;

  return mergedEntity as T;
}

/**
 * Fusionne deux tableaux d'entités en appliquant le Field-Level Merging pour les doublons.
 */
export function mergeByIdLWW<T extends HasFieldUpdates>(local: T[], remote: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of local) {
    map.set(item.id, item);
  }
  for (const item of remote) {
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      continue;
    }
    const merged = mergeEntitiesFLM(existing, item);
    map.set(item.id, merged);
  }
  return Array.from(map.values());
}

function mergeWorkflows(local: Workflow[], remote: Workflow[]): Workflow[] {
  const map = new Map<string, Workflow>();
  for (const w of local) map.set(w.id, w);
  for (const w of remote) {
    const existing = map.get(w.id);
    if (!existing) {
      map.set(w.id, w);
      continue;
    }

    const mergedWf = mergeEntitiesFLM(
      existing as unknown as HasFieldUpdates,
      w as unknown as HasFieldUpdates
    ) as unknown as Workflow;

    // Fusionne également les nœuds et arêtes de manière granulaire
    const nodes = mergeByIdLWW(
      (existing.nodes || []).map((n) => ({
        ...n,
        updatedAt: (n as any).updatedAt || existing.updatedAt,
      })) as unknown as HasFieldUpdates[],
      (w.nodes || []).map((n) => ({
        ...n,
        updatedAt: (n as any).updatedAt || w.updatedAt,
      })) as unknown as HasFieldUpdates[]
    );

    const edgeMap = new Map((existing.edges || []).map((e) => [e.id, e]));
    for (const e of w.edges || []) {
      edgeMap.set(e.id, e);
    }

    map.set(w.id, {
      ...mergedWf,
      nodes: nodes as unknown as Workflow['nodes'],
      edges: Array.from(edgeMap.values()),
    });
  }
  return Array.from(map.values());
}

function mergeTodoLists(local: TodoList[], remote: TodoList[]): TodoList[] {
  const map = new Map<string, TodoList>();
  for (const l of local) map.set(l.id, l);
  for (const l of remote) {
    const existing = map.get(l.id);
    if (!existing) {
      map.set(l.id, l);
      continue;
    }

    const mergedList = mergeEntitiesFLM(
      existing as unknown as HasFieldUpdates,
      l as unknown as HasFieldUpdates
    ) as unknown as TodoList;

    const items = mergeByIdLWW(
      (existing.items || []).map((it) => ({
        ...it,
        updatedAt: it.completedAt || it.createdAt,
      })) as unknown as HasFieldUpdates[],
      (l.items || []).map((it) => ({
        ...it,
        updatedAt: it.completedAt || it.createdAt,
      })) as unknown as HasFieldUpdates[]
    );

    map.set(l.id, {
      ...mergedList,
      items: items as unknown as TodoList['items'],
    });
  }
  return Array.from(map.values());
}

/**
 * Fusionne deux AppState complets (local vs remote snapshot).
 */
export function mergeAppStates(
  local: AppState,
  remote: AppState,
  opts?: { preferRemoteUI?: boolean }
): AppState {
  return {
    ...local,
    version: Math.max(local.version ?? 1, remote.version ?? 1),
    workflows: mergeWorkflows(local.workflows ?? [], remote.workflows ?? []),
    notes: mergeByIdLWW((local.notes || []) as unknown as HasFieldUpdates[], (remote.notes || []) as unknown as HasFieldUpdates[]) as unknown as Note[],
    folders: mergeByIdLWW(
      (local.folders || []) as unknown as HasFieldUpdates[],
      (remote.folders || []) as unknown as HasFieldUpdates[]
    ) as unknown as NoteFolder[],
    tasks: mergeByIdLWW((local.tasks || []) as unknown as HasFieldUpdates[], (remote.tasks || []) as unknown as HasFieldUpdates[]) as unknown as Task[],
    todoLists: mergeTodoLists(local.todoLists ?? [], remote.todoLists ?? []),
    events: mergeByIdLWW(
      (local.events || []) as unknown as HasFieldUpdates[],
      (remote.events || []) as unknown as HasFieldUpdates[]
    ) as unknown as CalendarEvent[],
    activities: mergeByIdLWW(
      (local.activities || []) as unknown as HasFieldUpdates[],
      (remote.activities || []) as unknown as HasFieldUpdates[]
    ) as unknown as Activity[],
    captures: mergeByIdLWW(
      (local.captures || []) as unknown as HasFieldUpdates[],
      (remote.captures || []) as unknown as HasFieldUpdates[]
    ) as unknown as BrainDumpItem[],
    ui: opts?.preferRemoteUI
      ? { ...local.ui, ...remote.ui, quickCaptureOpen: false, settingsOpen: false }
      : {
          ...local.ui,
        },
    lastSavedAt: new Date().toISOString(),
  };
}

/**
 * Indique si l'état distant contient des données plus récentes.
 */
export function remoteHasNewerData(local: AppState, remote: AppState): boolean {
  const ts = (e: any) => {
    const t = e.updatedAt || e.createdAt;
    return t ? new Date(t).getTime() : 0;
  };

  const checks: [any[], any[]][] = [
    [local.notes, remote.notes],
    [local.tasks, remote.tasks],
    [local.workflows, remote.workflows],
    [local.events, remote.events],
    [local.activities ?? [], remote.activities ?? []],
    [local.captures, remote.captures],
    [local.todoLists, remote.todoLists],
  ];

  for (const [loc, rem] of checks) {
    const map = new Map((loc || []).map((i) => [i.id, ts(i)]));
    for (const r of rem || []) {
      const lt = map.get(r.id);
      if (lt === undefined) return true;
      if (ts(r) > lt) return true;
    }
  }
  return false;
}

export const DataMerger = {
  mergeEntitiesFLM,
  mergeByIdLWW,
  mergeAppStates,
  mergeWorkflows,
  mergeTodoLists,
  remoteHasNewerData,
};

export default DataMerger;
