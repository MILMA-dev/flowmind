/**
 * FlowMind — CalendarScheduler
 * Chevauchements multi-activités + exclusivité dynamique des Workflows
 * Équipe MILMA Entreprise
 *
 * Formule de collision (intervalles inclusifs) :
 *   Overlap(A,B) = (Start_A ≤ End_B) ∧ (End_A ≥ Start_B)
 *
 * Exclusivité : un workflowId ne peut être réservé que par UNE activité
 * sur toute plage qui chevauche une réservation existante.
 */

import { EventBus } from './EventBus';
import { StateStore, uid } from './StateStore';
import {
  AppEvents,
  type Activity,
  type ActivityLaneLayout,
  type TimeRange,
  type Workflow,
  type WorkflowAvailability,
} from './Types';
import { dayKey, startOfDay } from './calendarUtils';

/** Chevauchement inclusif des intervalles [start, end] */
export function intervalsOverlap(
  aStart: Date | number | string,
  aEnd: Date | number | string,
  bStart: Date | number | string,
  bEnd: Date | number | string
): boolean {
  const as = new Date(aStart).getTime();
  const ae = new Date(aEnd).getTime();
  const bs = new Date(bStart).getTime();
  const be = new Date(bEnd).getTime();
  // (Start_A ≤ End_B) ∧ (End_A ≥ Start_B)
  return as <= be && ae >= bs;
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  return intervalsOverlap(a.start, a.end, b.start, b.end);
}

function formatRangeFr(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
  };
  const s = start.toLocaleDateString('fr-FR', opts);
  const e = end.toLocaleDateString('fr-FR', opts);
  return s === e ? s : `${s} → ${e}`;
}

const ACTIVITY_COLORS = [
  '#818cf8',
  '#22d3ee',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#fb923c',
];

class CalendarSchedulerImpl {
  getActivities(): Activity[] {
    return StateStore.getState().activities ?? [];
  }

  getActivity(id: string): Activity | null {
    return this.getActivities().find((a) => a.id === id) ?? null;
  }

  /**
   * Détecte toutes les activités qui chevauchent une plage donnée.
   */
  findOverlappingActivities(
    startDate: Date | string,
    endDate: Date | string,
    excludeActivityId?: string | null
  ): Activity[] {
    return this.getActivities().filter((act) => {
      if (excludeActivityId && act.id === excludeActivityId) return false;
      return intervalsOverlap(act.startDate, act.endDate, startDate, endDate);
    });
  }

  /**
   * Workflows disponibles pour une plage [start, end].
   *
   * Si Workflow1 est planifié du 5 au 9, il est marqué isAvailable:false
   * pour toute nouvelle activité chevauchant (ex: 8→10).
   *
   * @param currentActivityId — exclu de la collision (édition en cours)
   */
  getAvailableWorkflows(
    allWorkflows: Workflow[],
    activities: Activity[],
    startDate: Date | string,
    endDate: Date | string,
    currentActivityId?: string | null
  ): WorkflowAvailability[] {
    const rangeStart = new Date(startDate);
    const rangeEnd = new Date(endDate);

    // Index: workflowId → première activité conflictuelle
    const reservedBy = new Map<string, Activity>();
    for (const act of activities) {
      if (!act.workflowId) continue;
      if (currentActivityId && act.id === currentActivityId) continue;
      if (
        !intervalsOverlap(
          act.startDate,
          act.endDate,
          rangeStart,
          rangeEnd
        )
      ) {
        continue;
      }
      if (!reservedBy.has(act.workflowId)) {
        reservedBy.set(act.workflowId, act);
      }
    }

    return allWorkflows.map((wf) => {
      const conflict = reservedBy.get(wf.id);
      if (conflict) {
        const from = new Date(conflict.startDate);
        const to = new Date(conflict.endDate);
        const rangeLabel = formatRangeFr(from, to);
        const reason = `Réservé du ${rangeLabel}`;
        return {
          workflowId: wf.id,
          title: wf.title,
          color: wf.color,
          isAvailable: false,
          reason,
          disabledLabel: `${wf.title} — ${reason}`,
          conflictingActivityId: conflict.id,
          conflictingActivityTitle: conflict.title,
          reservedFrom: conflict.startDate,
          reservedTo: conflict.endDate,
        };
      }

      return {
        workflowId: wf.id,
        title: wf.title,
        color: wf.color,
        isAvailable: true,
        disabledLabel: wf.title,
      };
    });
  }

  /** true si le workflow peut être réservé sur la plage */
  isWorkflowAvailable(
    workflowId: string,
    startDate: Date | string,
    endDate: Date | string,
    currentActivityId?: string | null
  ): boolean {
    const list = this.getAvailableWorkflows(
      StateStore.getState().workflows,
      this.getActivities(),
      startDate,
      endDate,
      currentActivityId
    );
    return list.find((a) => a.workflowId === workflowId)?.isAvailable ?? false;
  }

  /** Activités qui chevauchent une plage (pour affichage) */
  getActivitiesForRange(start: Date, end: Date): Activity[] {
    return this.getActivities().filter((a) =>
      intervalsOverlap(a.startDate, a.endDate, start, end)
    );
  }

  /**
   * Assigne des pistes parallèles (stacked rows) pour chevauchements.
   * Algorithme greedy : place chaque activité sur la première lane libre
   * (lane libre ssi end_lane < start_activity).
   */
  computeLanes(
    activities: Activity[],
    rangeStart: Date,
    rangeEnd: Date
  ): ActivityLaneLayout[] {
    const rangeMs = Math.max(rangeEnd.getTime() - rangeStart.getTime(), 1);
    const dayMs = 24 * 60 * 60 * 1000;
    const sorted = [...activities].sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime() ||
        new Date(a.endDate).getTime() - new Date(b.endDate).getTime()
    );

    const laneEnds: number[] = [];
    const assigned: { id: string; lane: number }[] = [];

    for (const act of sorted) {
      const s = new Date(act.startDate).getTime();
      const e = new Date(act.endDate).getTime();
      // Première lane dont la fin est strictement avant le début (pas de chevauchement)
      let lane = laneEnds.findIndex((end) => end < s);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(e);
      } else {
        laneEnds[lane] = e;
      }
      assigned.push({ id: act.id, lane });
    }

    const laneCount = Math.max(laneEnds.length, 1);

    return assigned.map(({ id, lane }) => {
      const act = sorted.find((a) => a.id === id)!;
      const s = Math.max(
        new Date(act.startDate).getTime(),
        rangeStart.getTime()
      );
      const e = Math.min(
        new Date(act.endDate).getTime(),
        rangeEnd.getTime()
      );
      const leftPct = ((s - rangeStart.getTime()) / rangeMs) * 100;
      const widthPct = Math.max(((e - s) / rangeMs) * 100, 2);
      const daySpan = Math.max(1, Math.round((e - s) / dayMs) + 1);
      return {
        activityId: id,
        lane,
        laneCount,
        leftPct: Math.max(0, Math.min(100, leftPct)),
        widthPct: Math.max(1.5, Math.min(100 - leftPct, widthPct)),
        daySpan,
      };
    });
  }

  saveActivity(
    input: Partial<Activity> & {
      title?: string;
      startDate: string;
      endDate: string;
    }
  ): Activity | null {
    const now = new Date().toISOString();
    const existing = input.id ? this.getActivity(input.id) : null;

    // Validation exclusivité workflow
    if (input.workflowId) {
      const availability = this.getAvailableWorkflows(
        StateStore.getState().workflows,
        this.getActivities(),
        input.startDate,
        input.endDate,
        input.id ?? null
      );
      const slot = availability.find((a) => a.workflowId === input.workflowId);
      if (slot && !slot.isAvailable) {
        EventBus.publish(AppEvents.TOAST_SHOW, {
          id: uid('toast'),
          type: 'error',
          title: 'Workflow indisponible',
          description: slot.reason,
          duration: 3200,
        });
        return null;
      }
    }

    const activity: Activity = {
      id: existing?.id || uid('act'),
      title: (input.title ?? existing?.title ?? 'Activité').trim() || 'Activité',
      description: input.description ?? existing?.description ?? '',
      startDate: input.startDate,
      endDate: input.endDate,
      allDay: input.allDay ?? existing?.allDay ?? true,
      color:
        input.color ||
        existing?.color ||
        ACTIVITY_COLORS[this.getActivities().length % ACTIVITY_COLORS.length],
      workflowId:
        input.workflowId !== undefined
          ? input.workflowId
          : existing?.workflowId ?? null,
      linkedEventId: existing?.linkedEventId ?? null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    if (existing) {
      StateStore.updateActivity(activity);
    } else {
      StateStore.addActivity(activity);
    }

    EventBus.publish(AppEvents.ACTIVITY_SAVED, { activity });
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type: 'success',
      title: existing ? 'Activité mise à jour' : 'Activité planifiée',
      description: activity.title,
      duration: 2200,
    });

    return activity;
  }

  deleteActivity(id: string): void {
    const act = this.getActivity(id);
    if (!act) return;
    StateStore.removeActivity(id);
    EventBus.publish(AppEvents.ACTIVITY_DELETED, { id, activity: act });
  }

  /** Nettoie les réservations d'un workflow supprimé */
  detachWorkflow(workflowId: string): void {
    for (const act of this.getActivities()) {
      if (act.workflowId === workflowId) {
        StateStore.updateActivity({
          ...act,
          workflowId: null,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  /** Jours couverts par une activité (pour badges mois) */
  activityDayKeys(act: Activity): string[] {
    const keys: string[] = [];
    let cur = startOfDay(new Date(act.startDate));
    const end = startOfDay(new Date(act.endDate));
    let guard = 0;
    while (cur.getTime() <= end.getTime() && guard < 400) {
      keys.push(dayKey(cur));
      cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
      guard++;
    }
    return keys;
  }

  /**
   * Seed démo : deux activités chevauchantes pour illustrer
   * les pistes parallèles + exclusivité workflow.
   */
  seedDemoIfEmpty(): void {
    if (this.getActivities().length > 0) return;
    const workflows = StateStore.getState().workflows;
    const today = startOfDay(new Date());

    const d = (offset: number) => {
      const x = new Date(today);
      x.setDate(x.getDate() + offset);
      return x.toISOString();
    };

    // A: J+1 → J+5  (réserve premier workflow si dispo)
    this.saveActivity({
      title: 'Sprint Focus',
      description: 'Bloc principal — réserve le workflow',
      startDate: d(1),
      endDate: d(5),
      allDay: true,
      color: '#818cf8',
      workflowId: workflows[0]?.id ?? null,
    });

    // B: J+4 → J+8  (chevauche A sur J+4/J+5 — autre couleur, sans même WF)
    this.saveActivity({
      title: 'Revue croisée',
      description: 'Chevauche Sprint Focus — piste parallèle',
      startDate: d(4),
      endDate: d(8),
      allDay: true,
      color: '#22d3ee',
      workflowId: workflows[1]?.id ?? null,
    });

    // C: J+6 → J+10
    this.saveActivity({
      title: 'Livraison',
      description: 'Fin de cycle',
      startDate: d(6),
      endDate: d(10),
      allDay: true,
      color: '#34d399',
      workflowId: null,
    });
  }
}

export const CalendarScheduler = new CalendarSchedulerImpl();
export default CalendarScheduler;
