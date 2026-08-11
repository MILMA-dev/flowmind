/**
 * FlowMind — SubtaskManager
 * CRUD des sous-tâches hiérarchiques + progression nœud parent
 * Équipe MILMA Entreprise
 *
 * Optimisé : patchNodeSoft pour éviter un recalcul complet du canvas.
 */

import { EventBus } from './EventBus';
import { StateStore, computeProgress, uid } from './StateStore';
import {
  AppEvents,
  type Subtask,
  type WorkflowNode,
} from './Types';

export { computeProgress };

function findNode(
  workflowId: string,
  nodeId: string
): { node: WorkflowNode; workflowId: string } | null {
  const wf = StateStore.getState().workflows.find((w) => w.id === workflowId);
  if (!wf) return null;
  const node = wf.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  return { node, workflowId };
}

class SubtaskManagerImpl {
  private registered = false;

  register(): void {
    if (this.registered) return;
    this.registered = true;

    EventBus.subscribe('ADD_SUBTASK_REQUESTED', (payload) => {
      const p = payload as { workflowId: string; nodeId: string; title?: string };
      if (p?.workflowId && p?.nodeId) this.add(p.workflowId, p.nodeId, p.title);
    });

    EventBus.subscribe('TOGGLE_SUBTASK_REQUESTED', (payload) => {
      const p = payload as { workflowId: string; nodeId: string; subtaskId: string };
      if (p?.workflowId && p?.nodeId && p?.subtaskId) {
        this.toggle(p.workflowId, p.nodeId, p.subtaskId);
      }
    });
  }

  /** Ajoute une sous-tâche en fin de liste */
  add(workflowId: string, nodeId: string, title = ''): Subtask | null {
    const found = findNode(workflowId, nodeId);
    if (!found) return null;

    const now = new Date().toISOString();
    const subtask: Subtask = {
      id: uid('sub'),
      title: title.trim() || 'Nouvelle sous-tâche',
      done: false,
      order: found.node.subtasks.length,
      createdAt: now,
      completedAt: null,
    };

    const subtasks = [...found.node.subtasks, subtask];
    this.apply(workflowId, nodeId, subtasks);
    EventBus.publish(AppEvents.SUBTASK_ADDED, { workflowId, nodeId, subtask });
    return subtask;
  }

  /** Bascule done / not done */
  toggle(workflowId: string, nodeId: string, subtaskId: string): void {
    const found = findNode(workflowId, nodeId);
    if (!found) return;

    const now = new Date().toISOString();
    const subtasks = found.node.subtasks.map((s) =>
      s.id === subtaskId
        ? {
            ...s,
            done: !s.done,
            completedAt: !s.done ? now : null,
          }
        : s
    );
    this.apply(workflowId, nodeId, subtasks);
    EventBus.publish(AppEvents.SUBTASK_UPDATED, { workflowId, nodeId, subtaskId });
  }

  /** Édite le titre en place */
  updateTitle(
    workflowId: string,
    nodeId: string,
    subtaskId: string,
    title: string
  ): void {
    const found = findNode(workflowId, nodeId);
    if (!found) return;

    const subtasks = found.node.subtasks.map((s) =>
      s.id === subtaskId ? { ...s, title } : s
    );
    this.apply(workflowId, nodeId, subtasks);
    EventBus.publish(AppEvents.SUBTASK_UPDATED, { workflowId, nodeId, subtaskId });
  }

  /** Supprime une sous-tâche et réordonne */
  remove(workflowId: string, nodeId: string, subtaskId: string): void {
    const found = findNode(workflowId, nodeId);
    if (!found) return;

    const subtasks = found.node.subtasks
      .filter((s) => s.id !== subtaskId)
      .map((s, i) => ({ ...s, order: i }));
    this.apply(workflowId, nodeId, subtasks);
    EventBus.publish(AppEvents.SUBTASK_REMOVED, { workflowId, nodeId, subtaskId });
  }

  /**
   * Réordonnancement par indices (drag & drop).
   * fromIndex / toIndex dans la liste triée par order.
   */
  reorder(
    workflowId: string,
    nodeId: string,
    fromIndex: number,
    toIndex: number
  ): void {
    const found = findNode(workflowId, nodeId);
    if (!found) return;

    const sorted = [...found.node.subtasks].sort((a, b) => a.order - b.order);
    if (
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= sorted.length ||
      toIndex >= sorted.length ||
      fromIndex === toIndex
    ) {
      return;
    }

    const [item] = sorted.splice(fromIndex, 1);
    sorted.splice(toIndex, 0, item);
    const subtasks = sorted.map((s, i) => ({ ...s, order: i }));
    this.apply(workflowId, nodeId, subtasks);
    EventBus.publish(AppEvents.SUBTASK_REORDERED, {
      workflowId,
      nodeId,
      fromIndex,
      toIndex,
    });
  }

  /** Réinitialise toutes les sous-tâches (récurrence reset) */
  resetAll(workflowId: string, nodeId: string): void {
    const found = findNode(workflowId, nodeId);
    if (!found) return;

    const subtasks = found.node.subtasks.map((s) => ({
      ...s,
      done: false,
      completedAt: null,
    }));
    this.apply(workflowId, nodeId, subtasks);
  }

  /** Pourcentage d'achèvement d'un nœud */
  getProgress(workflowId: string, nodeId: string): number {
    const found = findNode(workflowId, nodeId);
    if (!found) return 0;
    return computeProgress(found.node.subtasks);
  }

  private apply(workflowId: string, nodeId: string, subtasks: Subtask[]): void {
    const progress = computeProgress(subtasks);
    // Soft patch : pas de WORKFLOW_UPDATED lourd — canvas lit le state via store
    StateStore.patchNodeSoft(workflowId, nodeId, { subtasks, progress });
  }
}

export const SubtaskManager = new SubtaskManagerImpl();
export default SubtaskManager;
