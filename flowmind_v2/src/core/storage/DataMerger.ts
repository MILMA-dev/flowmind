/**
 * DataMerger — fusion granulaire Last-Write-Wins (LWW)
 * Compare item par item via updatedAt / createdAt
 * Équipe MILMA Entreprise
 */

import type { AppState, Note, Task, TodoList, Workflow } from '../Types';
import type {
  Activity,
  BrainDumpItem,
  CalendarEvent,
  NoteFolder,
} from '../Types';

type IdEntity = { id: string; updatedAt?: string; createdAt?: string };

function ts(e: IdEntity): number {
  const t = e.updatedAt || e.createdAt;
  return t ? new Date(t).getTime() : 0;
}

/**
 * Fusionne deux tableaux d'entités par id.
 * L'horodatage le plus récent gagne pour chaque item.
 * Les items absents d'un côté sont conservés (union).
 */
export function mergeByIdLWW<T extends IdEntity>(
  local: T[],
  remote: T[]
): T[] {
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
    if (ts(item) >= ts(existing)) {
      map.set(item.id, item);
    }
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
    // LWW au niveau workflow, mais merge nodes/edges par id aussi
    const newer = ts(w) >= ts(existing) ? w : existing;
    const older = newer === w ? existing : w;
    const nodes = mergeByIdLWW(
      older.nodes.map((n) => ({
        ...n,
        updatedAt: (n as { updatedAt?: string }).updatedAt || newer.updatedAt,
      })),
      newer.nodes.map((n) => ({
        ...n,
        updatedAt: (n as { updatedAt?: string }).updatedAt || newer.updatedAt,
      }))
    );
    // edges : par id simple (pas d'updatedAt) — union, préférer newer si même id
    const edgeMap = new Map(older.edges.map((e) => [e.id, e]));
    for (const e of newer.edges) edgeMap.set(e.id, e);
    map.set(newer.id, {
      ...newer,
      nodes: nodes as Workflow['nodes'],
      edges: Array.from(edgeMap.values()),
      updatedAt:
        ts(w) >= ts(existing) ? w.updatedAt : existing.updatedAt,
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
    const base = ts(l) >= ts(existing) ? l : existing;
    const other = base === l ? existing : l;
    // Merge items granulaire
    const items = mergeByIdLWW(
      other.items.map((it) => ({
        ...it,
        updatedAt: it.completedAt || it.createdAt,
      })),
      base.items.map((it) => ({
        ...it,
        updatedAt: it.completedAt || it.createdAt,
      }))
    );
    map.set(base.id, {
      ...base,
      items: items.map(({ updatedAt: _u, ...rest }) => rest) as TodoList['items'],
    });
  }
  return Array.from(map.values());
}

/**
 * Fusionne deux AppState (local vs remote snapshot).
 * UI locale est préservée (activeZone, etc.) sauf si opts.replaceUI.
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
    notes: mergeByIdLWW(local.notes ?? [], remote.notes ?? []) as Note[],
    folders: mergeByIdLWW(
      (local.folders ?? []) as (NoteFolder & IdEntity)[],
      (remote.folders ?? []) as (NoteFolder & IdEntity)[]
    ) as NoteFolder[],
    tasks: mergeByIdLWW(local.tasks ?? [], remote.tasks ?? []) as Task[],
    todoLists: mergeTodoLists(local.todoLists ?? [], remote.todoLists ?? []),
    events: mergeByIdLWW(
      (local.events ?? []) as (CalendarEvent & IdEntity)[],
      (remote.events ?? []) as (CalendarEvent & IdEntity)[]
    ) as CalendarEvent[],
    activities: mergeByIdLWW(
      local.activities ?? [],
      remote.activities ?? []
    ) as Activity[],
    captures: mergeByIdLWW(
      local.captures ?? [],
      remote.captures ?? []
    ) as BrainDumpItem[],
    ui: opts?.preferRemoteUI
      ? { ...local.ui, ...remote.ui, quickCaptureOpen: false, settingsOpen: false }
      : {
          ...local.ui,
          // conserve préférences locales de navigation
        },
    lastSavedAt: new Date().toISOString(),
  };
}

/**
 * Compare deux états : true si remote a au moins une entité plus récente
 * ou des ids inconnus localement.
 */
export function remoteHasNewerData(local: AppState, remote: AppState): boolean {
  const checks: [IdEntity[], IdEntity[]][] = [
    [local.notes, remote.notes],
    [local.tasks, remote.tasks],
    [local.workflows, remote.workflows],
    [local.events as IdEntity[], remote.events as IdEntity[]],
    [local.activities ?? [], remote.activities ?? []],
    [local.captures, remote.captures],
    [local.todoLists, remote.todoLists],
  ];
  for (const [loc, rem] of checks) {
    const map = new Map(loc.map((i) => [i.id, ts(i)]));
    for (const r of rem) {
      const lt = map.get(r.id);
      if (lt === undefined) return true;
      if (ts(r) > lt) return true;
    }
  }
  return false;
}

export const DataMerger = {
  mergeByIdLWW,
  mergeAppStates,
  mergeWorkflows,
  mergeTodoLists,
  remoteHasNewerData,
};

export default DataMerger;
