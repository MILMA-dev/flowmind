/**
 * FlowMind — RecurrenceEngine
 * Ordonnancement local des routines (cron-like simplifié)
 * Équipe MILMA Entreprise
 *
 * Évalue nextRunAt au boot et en intervalle de fond.
 * Comportements : reset sous-tâches | dupliquer nœud (journal).
 */

import { EventBus } from './EventBus';
import { StateStore, uid, computeProgress } from './StateStore';
import { SubtaskManager } from './SubtaskManager';
import {
  AppEvents,
  DEFAULT_RECURRENCE,
  type RecurrenceFrequency,
  type RecurrenceRule,
  type WorkflowNode,
} from './Types';

const TICK_MS = 60_000; // évaluation fond chaque minute

/** Calcule la prochaine occurrence à partir de `from` */
export function computeNextRun(
  rule: RecurrenceRule,
  from: Date = new Date()
): string | null {
  if (!rule.enabled || rule.frequency === 'none') return null;

  const base = new Date(from);

  switch (rule.frequency) {
    case 'daily': {
      const d = new Date(base);
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case 'weekly': {
      const d = new Date(base);
      d.setDate(d.getDate() + 7);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case 'monthly': {
      const d = new Date(base);
      d.setMonth(d.getMonth() + 1);
      d.setHours(0, 0, 0, 0);
      return d.toISOString();
    }
    case 'custom': {
      const d = new Date(base);
      const n = Math.max(1, rule.interval || 1);
      if (rule.intervalUnit === 'hours') {
        d.setTime(d.getTime() + n * 60 * 60 * 1000);
      } else {
        d.setDate(d.getDate() + n);
        d.setHours(0, 0, 0, 0);
      }
      return d.toISOString();
    }
    default:
      return null;
  }
}

/** Initialise nextRunAt si règle active sans date */
export function ensureNextRun(rule: RecurrenceRule): RecurrenceRule {
  if (!rule.enabled || rule.frequency === 'none') {
    return { ...rule, nextRunAt: null, enabled: false };
  }
  if (rule.nextRunAt) return rule;
  return {
    ...rule,
    enabled: true,
    nextRunAt: computeNextRun(rule, new Date()),
  };
}

export function recurrenceLabel(rule: RecurrenceRule): string {
  if (!rule.enabled || rule.frequency === 'none') return 'Aucune';
  switch (rule.frequency) {
    case 'daily':
      return 'Quotidienne';
    case 'weekly':
      return 'Hebdomadaire';
    case 'monthly':
      return 'Mensuelle';
    case 'custom':
      return `Tous les ${rule.interval} ${
        rule.intervalUnit === 'hours' ? 'h' : 'j'
      }`;
    default:
      return 'Aucune';
  }
}

class RecurrenceEngineImpl {
  private registered = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  register(): void {
    if (this.registered) return;
    this.registered = true;

    // Évaluation immédiate au boot
    this.evaluateAll();

    // Horloge de fond
    this.timer = setInterval(() => this.evaluateAll(), TICK_MS);

    EventBus.subscribe(AppEvents.DATA_LOADED, () => {
      this.evaluateAll();
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Configure la règle de récurrence d'un nœud */
  configure(
    workflowId: string,
    nodeId: string,
    partial: Partial<RecurrenceRule>
  ): RecurrenceRule | null {
    const wf = StateStore.getState().workflows.find((w) => w.id === workflowId);
    const node = wf?.nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    let rule: RecurrenceRule = {
      ...DEFAULT_RECURRENCE,
      ...node.recurrence,
      ...partial,
    };

    // Auto-enable si fréquence != none
    if (partial.frequency !== undefined) {
      rule.enabled = partial.frequency !== 'none';
    }

    // Recalcule nextRunAt si fréquence / interval change
    if (
      partial.frequency !== undefined ||
      partial.interval !== undefined ||
      partial.intervalUnit !== undefined ||
      partial.enabled !== undefined
    ) {
      rule.nextRunAt = null;
      rule = ensureNextRun(rule);
    }

    StateStore.patchNodeSoft(workflowId, nodeId, { recurrence: rule });
    EventBus.publish(AppEvents.RECURRENCE_CONFIGURED, {
      workflowId,
      nodeId,
      rule,
    });
    return rule;
  }

  /** Parcourt tous les workflows et déclenche les échéances */
  evaluateAll(now = new Date()): number {
    const state = StateStore.getState();
    let triggered = 0;

    for (const wf of state.workflows) {
      for (const node of wf.nodes) {
        const rule = node.recurrence ?? DEFAULT_RECURRENCE;
        if (!rule.enabled || rule.frequency === 'none' || !rule.nextRunAt) {
          continue;
        }
        if (new Date(rule.nextRunAt).getTime() <= now.getTime()) {
          this.trigger(wf.id, node, now);
          triggered += 1;
        }
      }
    }

    return triggered;
  }

  /**
   * Déclenche une occurrence :
   * - reset : réinitialise sous-tâches
   * - duplicate : archive un clone "journal" décalé sous le nœud
   */
  trigger(workflowId: string, node: WorkflowNode, now = new Date()): void {
    const rule = node.recurrence ?? DEFAULT_RECURRENCE;
    const nextRunAt = computeNextRun(rule, now);
    const lastRunAt = now.toISOString();

    if (rule.onComplete === 'duplicate') {
      this.duplicateAsHistory(workflowId, node, now);
    }

    // Reset checklist
    SubtaskManager.resetAll(workflowId, node.id);

    const updatedRule: RecurrenceRule = {
      ...rule,
      lastRunAt,
      nextRunAt,
      enabled: rule.frequency !== 'none',
    };

    StateStore.patchNodeSoft(workflowId, node.id, {
      recurrence: updatedRule,
      status: 'ready',
      executionState: 'ready',
      progress: 0,
    });

    EventBus.publish(AppEvents.RECURRENCE_TRIGGERED, {
      workflowId,
      nodeId: node.id,
      onComplete: rule.onComplete,
      nextRunAt,
    });

    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type: 'info',
      title: 'Routine renouvelée',
      description: node.label,
      duration: 2800,
    });
  }

  /** Clone le nœud comme entrée de journal (sous le parent) */
  private duplicateAsHistory(
    workflowId: string,
    node: WorkflowNode,
    now: Date
  ): void {
    const stamp = now.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });

    const clone: WorkflowNode = {
      ...node,
      id: uid('node'),
      label: `${node.label} · ${stamp}`,
      type: 'note',
      x: node.x,
      y: node.y + 110,
      status: 'completed',
      executionState: 'completed',
      subtasks: node.subtasks.map((s) => ({
        ...s,
        id: uid('sub'),
      })),
      progress: computeProgress(node.subtasks),
      recurrence: { ...DEFAULT_RECURRENCE },
      data: {
        ...(node.data ?? {}),
        historyOf: node.id,
        archivedAt: now.toISOString(),
      },
    };

    StateStore.addNodeToWorkflow(workflowId, clone);
    EventBus.publish(AppEvents.NODE_CREATED, { node: clone, workflowId, history: true });
  }

  /** Helpers UI */
  static frequencies(): { id: RecurrenceFrequency; label: string }[] {
    return [
      { id: 'none', label: 'Aucune' },
      { id: 'daily', label: 'Quotidienne' },
      { id: 'weekly', label: 'Hebdomadaire' },
      { id: 'monthly', label: 'Mensuelle' },
      { id: 'custom', label: 'Personnalisée' },
    ];
  }
}

export const RecurrenceEngine = new RecurrenceEngineImpl();
export default RecurrenceEngine;
