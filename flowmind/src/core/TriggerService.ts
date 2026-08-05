/**
 * FlowMind — TriggerService
 * Déclencheurs manuels, temporels, événements système + calendrier
 * Équipe MILMA Entreprise
 */

import { EventBus } from './EventBus';
import { StateStore, uid } from './StateStore';
import { ExecutionEngine } from './ExecutionEngine';
import { CalendarManager } from './CalendarManager';
import {
  AppEvents,
  type CalendarEvent,
  type TriggerConfig,
  type WorkflowNode,
} from './Types';
import { eventStart } from './calendarUtils';

const TICK_MS = 15_000; // 15s pour réactivité calendrier

interface TriggerRef {
  workflowId: string;
  nodeId: string;
  config: TriggerConfig;
}

class TriggerServiceImpl {
  private registered = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** anti double-fire même minute / event */
  private firedKeys = new Set<string>();

  register(): void {
    if (this.registered) return;
    this.registered = true;

    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();

    EventBus.subscribe(AppEvents.BRAIN_DUMP_ITEM_CONVERTED, (payload) => {
      const p = payload as { targetType?: string; createdId?: string };
      this.fireEventTriggers('BRAIN_DUMP_ITEM_CONVERTED', p);
      if (p?.targetType === 'workflow' && p.createdId) {
        this.activateNodeById(p.createdId);
      }
    });

    EventBus.subscribe(AppEvents.CAPTURE_ADDED, () => {
      this.fireEventTriggers('CAPTURE_ADDED', {});
    });

    EventBus.subscribe(AppEvents.RECURRENCE_TRIGGERED, (payload) => {
      this.fireEventTriggers('RECURRENCE_TRIGGERED', payload);
    });

    EventBus.subscribe(AppEvents.DATA_LOADED, () => {
      this.tick();
    });

    EventBus.subscribe(AppEvents.CALENDAR_EVENT_SAVED, () => {
      // Réévalue immédiatement après planification
      this.checkCalendarTriggers();
    });

    EventBus.subscribe('FIRE_TRIGGER_REQUESTED', (payload) => {
      const p = payload as { workflowId: string; nodeId: string };
      if (p?.workflowId && p?.nodeId) {
        this.fireManual(p.workflowId, p.nodeId);
      }
    });

    EventBus.subscribe(AppEvents.TRIGGER_ACTIVATED, (payload) => {
      const p = payload as {
        workflowId: string;
        nodeId: string;
        eventId?: string;
        source?: string;
      };
      if (p?.workflowId && p?.nodeId) {
        ExecutionEngine.triggerWorkflow(p.workflowId, p.nodeId);
      }
    });

    EventBus.publish(AppEvents.TRIGGER_REGISTERED, {
      at: new Date().toISOString(),
    });
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private tick(): void {
    this.checkTimeTriggers();
    this.checkCalendarTriggers();
  }

  listActive(): TriggerRef[] {
    const out: TriggerRef[] = [];
    for (const wf of StateStore.getState().workflows) {
      for (const n of wf.nodes) {
        if (n.type !== 'trigger' && n.trigger?.kind === 'none') continue;
        const cfg = n.trigger;
        if (!cfg?.enabled) continue;
        if (cfg.kind === 'none') continue;
        out.push({ workflowId: wf.id, nodeId: n.id, config: cfg });
      }
    }
    return out;
  }

  fireManual(workflowId: string, nodeId: string): void {
    const node = this.getNode(workflowId, nodeId);
    if (!node) return;

    this.markFired(workflowId, nodeId);
    EventBus.publish(AppEvents.TRIGGER_FIRED, {
      workflowId,
      nodeId,
      kind: 'manual',
    });
    EventBus.publish(AppEvents.TRIGGER_ACTIVATED, {
      workflowId,
      nodeId,
      source: 'manual',
    });
  }

  configure(
    workflowId: string,
    nodeId: string,
    partial: Partial<TriggerConfig>
  ): void {
    const node = this.getNode(workflowId, nodeId);
    if (!node) return;
    const trigger: TriggerConfig = {
      ...node.trigger,
      ...partial,
    };
    StateStore.patchNodeSoft(workflowId, nodeId, { trigger });
  }

  // ─── Time-based (nœuds) ───────────────────────────────

  private checkTimeTriggers(): void {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}`;
    const dayKey = now.toISOString().slice(0, 10);

    for (const ref of this.listActive()) {
      if (ref.config.kind !== 'time') continue;
      const target = ref.config.timeOfDay;
      if (!target || target !== hhmm) continue;

      const fireKey = `node:${ref.workflowId}:${ref.nodeId}:${dayKey}:${hhmm}`;
      if (this.firedKeys.has(fireKey)) continue;
      this.firedKeys.add(fireKey);
      this.pruneFiredKeys();

      this.markFired(ref.workflowId, ref.nodeId);
      EventBus.publish(AppEvents.TRIGGER_FIRED, {
        workflowId: ref.workflowId,
        nodeId: ref.nodeId,
        kind: 'time',
        timeOfDay: target,
      });
      EventBus.publish(AppEvents.TRIGGER_ACTIVATED, {
        workflowId: ref.workflowId,
        nodeId: ref.nodeId,
        source: 'time',
      });

      EventBus.publish(AppEvents.TOAST_SHOW, {
        id: uid('toast'),
        type: 'info',
        title: 'Trigger temporel',
        description: `Déclenché à ${target}`,
        duration: 2800,
      });
    }
  }

  // ─── Calendrier → Nœuds ───────────────────────────────

  /**
   * Parcourt les événements liés à un nœud/workflow.
   * Si startDate ≤ now et pas encore tiré → TRIGGER_ACTIVATED
   */
  checkCalendarTriggers(now = new Date()): void {
    const events = CalendarManager.getEvents();
    const windowMs = 2 * 60 * 1000; // fenêtre 2 min après le début

    for (const event of events) {
      if (!event.linkedNodeId || !event.linkedWorkflowId) continue;
      if (event.triggerFiredAt) continue;

      const start = eventStart(event);
      const delta = now.getTime() - start.getTime();
      // Déclenche si on est dans [start, start+2min] ou si on a manqué de peu au boot (jusqu'à 1h)
      if (delta < 0) continue;
      if (delta > 60 * 60 * 1000) continue; // trop vieux
      // Au tick normal, préfère la fenêtre courte ; au boot (delta large) on accepte jusqu'à 1h
      const isBootCatchup = delta > windowMs;
      if (isBootCatchup && delta > 60 * 60 * 1000) continue;

      const fireKey = `cal:${event.id}:${start.toISOString()}`;
      if (this.firedKeys.has(fireKey)) continue;
      this.firedKeys.add(fireKey);
      this.pruneFiredKeys();

      this.activateCalendarEvent(event);
    }
  }

  private activateCalendarEvent(event: CalendarEvent): void {
    const workflowId = event.linkedWorkflowId!;
    const nodeId = event.linkedNodeId!;

    // Vérifie que le nœud existe toujours
    const node = this.getNode(workflowId, nodeId);
    if (!node) return;

    CalendarManager.markTriggerFired(event.id);

    EventBus.publish(AppEvents.TRIGGER_FIRED, {
      workflowId,
      nodeId,
      kind: 'calendar',
      eventId: event.id,
    });

    EventBus.publish(AppEvents.TRIGGER_ACTIVATED, {
      workflowId,
      nodeId,
      eventId: event.id,
      source: 'calendar',
      title: event.title,
    });

    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type: 'success',
      title: 'Trigger calendrier',
      description: event.title,
      duration: 3200,
    });
  }

  // ─── Event-based ──────────────────────────────────────

  private fireEventTriggers(eventName: string, payload: unknown): void {
    for (const ref of this.listActive()) {
      if (ref.config.kind !== 'event') continue;
      if (ref.config.eventName !== eventName) continue;

      this.markFired(ref.workflowId, ref.nodeId);
      EventBus.publish(AppEvents.TRIGGER_FIRED, {
        workflowId: ref.workflowId,
        nodeId: ref.nodeId,
        kind: 'event',
        eventName,
        payload,
      });
      EventBus.publish(AppEvents.TRIGGER_ACTIVATED, {
        workflowId: ref.workflowId,
        nodeId: ref.nodeId,
        source: 'event',
        eventName,
      });
    }
  }

  private activateNodeById(nodeId: string): void {
    for (const wf of StateStore.getState().workflows) {
      const node = wf.nodes.find((n) => n.id === nodeId);
      if (!node) continue;
      ExecutionEngine.evaluateNode(wf.id, nodeId);
      const triggers = wf.nodes.filter((n) => n.type === 'trigger');
      if (triggers.length) {
        ExecutionEngine.startNode(wf.id, triggers[0].id);
      }
      break;
    }
  }

  private markFired(workflowId: string, nodeId: string): void {
    const node = this.getNode(workflowId, nodeId);
    if (!node) return;
    StateStore.patchNodeSoft(workflowId, nodeId, {
      trigger: {
        ...node.trigger,
        lastFiredAt: new Date().toISOString(),
      },
    });
  }

  private getNode(workflowId: string, nodeId: string): WorkflowNode | null {
    const wf = StateStore.getState().workflows.find((w) => w.id === workflowId);
    return wf?.nodes.find((n) => n.id === nodeId) ?? null;
  }

  private pruneFiredKeys(): void {
    if (this.firedKeys.size > 300) {
      this.firedKeys = new Set([...this.firedKeys].slice(-80));
    }
  }
}

export const TriggerService = new TriggerServiceImpl();
export default TriggerService;
