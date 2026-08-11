/**
 * FlowMind — CalendarManager
 * CRUD agenda, filtrage par plage, détection de conflits
 * Équipe MILMA Entreprise
 */

import { EventBus } from './EventBus';
import { StateStore, uid } from './StateStore';
import {
  AppEvents,
  type CalendarEvent,
} from './Types';
import {
  endOfDay,
  eventAllDay,
  eventEnd,
  eventStart,
  rangesOverlap,
  startOfDay,
} from './calendarUtils';

const EVENT_COLORS = [
  '#818cf8',
  '#22d3ee',
  '#34d399',
  '#fbbf24',
  '#f472b6',
  '#a78bfa',
  '#fb923c',
];

export type EventInput = Partial<CalendarEvent> & {
  title?: string;
  start?: string;
  end?: string;
  startDate?: string;
  endDate?: string;
};

function normalizeEvent(raw: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  const now = new Date().toISOString();
  const start = raw.startDate || raw.start || now;
  const end = raw.endDate || raw.end || start;
  const allDay = raw.isAllDay ?? raw.allDay ?? false;
  return {
    id: raw.id,
    title: raw.title?.trim() || 'Sans titre',
    description: raw.description ?? '',
    start,
    end,
    startDate: start,
    endDate: end,
    allDay,
    isAllDay: allDay,
    color: raw.color || EVENT_COLORS[0],
    linkedTaskId: raw.linkedTaskId ?? null,
    linkedNoteId: raw.linkedNoteId ?? null,
    linkedNodeId: raw.linkedNodeId ?? null,
    linkedWorkflowId: raw.linkedWorkflowId ?? null,
    triggerFiredAt: raw.triggerFiredAt ?? null,
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
  };
}

class CalendarManagerImpl {
  private registered = false;

  register(): void {
    if (this.registered) return;
    this.registered = true;

    // Normalise les events hérités au boot
    const state = StateStore.getState();
    if (state.events.some((e) => e.linkedNodeId === undefined || !e.start)) {
      StateStore.setEvents(state.events.map((e) => normalizeEvent(e as CalendarEvent)));
    }

    EventBus.subscribe(AppEvents.CREATE_EVENT_REQUESTED, (payload) => {
      const p = payload as { event?: CalendarEvent; fromCaptureId?: string };
      // ConversionService a déjà addEvent — normalise seulement
      if (p?.event && p.fromCaptureId) {
        const n = normalizeEvent(p.event);
        if (StateStore.getState().events.some((e) => e.id === n.id)) {
          StateStore.updateEvent(n);
        }
      }
    });
  }

  getEvents(): CalendarEvent[] {
    return StateStore.getState().events.map((e) => normalizeEvent(e));
  }

  getEvent(id: string): CalendarEvent | null {
    const e = StateStore.getState().events.find((x) => x.id === id);
    return e ? normalizeEvent(e) : null;
  }

  /** Événements chevauchant [rangeStart, rangeEnd] */
  getEventsForRange(rangeStart: Date, rangeEnd: Date): CalendarEvent[] {
    return this.getEvents().filter((e) => {
      const s = eventStart(e);
      const en = eventEnd(e);
      return rangesOverlap(s, en, rangeStart, rangeEnd);
    });
  }

  getEventsForDay(day: Date): CalendarEvent[] {
    return this.getEventsForRange(startOfDay(day), endOfDay(day));
  }

  /**
   * Crée ou met à jour un événement.
   * Émet CALENDAR_EVENT_SAVED.
   */
  saveEvent(eventData: EventInput): CalendarEvent {
    const now = new Date().toISOString();
    const existing = eventData.id ? this.getEvent(eventData.id) : null;

    const start =
      eventData.startDate ||
      eventData.start ||
      existing?.start ||
      new Date().toISOString();
    let end =
      eventData.endDate ||
      eventData.end ||
      existing?.end ||
      new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();

    if (new Date(end) <= new Date(start)) {
      end = new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString();
    }

    const event = normalizeEvent({
      ...existing,
      ...eventData,
      id: existing?.id || eventData.id || uid('evt'),
      start,
      end,
      startDate: start,
      endDate: end,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      // Reset trigger si l'heure de début change
      triggerFiredAt:
        existing && existing.start !== start ? null : existing?.triggerFiredAt ?? null,
    });

    if (existing) {
      StateStore.updateEvent(event);
    } else {
      StateStore.addEvent(event);
    }

    EventBus.publish(AppEvents.CALENDAR_EVENT_SAVED, { event });
    EventBus.publish(AppEvents.EVENT_CREATED, { event });
    EventBus.publish(AppEvents.EVENT_UPDATED, {
      events: StateStore.getState().events,
    });

    return event;
  }

  deleteEvent(id: string): void {
    if (!id) return;
    const raw = StateStore.getState().events.find((e) => e.id === id);
    const snapshot = raw
      ? normalizeEvent({ ...(raw as CalendarEvent), id })
      : null;
    // Supprime même si l'événement n'est plus trouvable après coup
    StateStore.removeEvent(id);
    EventBus.publish(AppEvents.CALENDAR_EVENT_DELETED, {
      id,
      event: snapshot,
    });
    EventBus.publish(AppEvents.EVENT_UPDATED, {
      events: StateStore.getState().events,
    });
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: `toast_del_${id}`,
      type: 'info',
      title: 'Événement supprimé',
      description: snapshot?.title,
      duration: 2200,
    });
  }

  /**
   * Détecte les collisions horaires (hors all-day, hors soi-même)
   */
  checkConflicts(newEvent: EventInput): CalendarEvent[] {
    const start = new Date(
      newEvent.startDate || newEvent.start || Date.now()
    );
    const end = new Date(
      newEvent.endDate ||
        newEvent.end ||
        start.getTime() + 60 * 60 * 1000
    );
    const allDay = newEvent.isAllDay ?? newEvent.allDay ?? false;
    if (allDay) return [];

    return this.getEvents().filter((e) => {
      if (newEvent.id && e.id === newEvent.id) return false;
      if (eventAllDay(e)) return false;
      return rangesOverlap(start, end, eventStart(e), eventEnd(e));
    });
  }

  markTriggerFired(id: string): void {
    const e = this.getEvent(id);
    if (!e) return;
    StateStore.updateEvent({
      ...e,
      triggerFiredAt: new Date().toISOString(),
    });
  }

  /** Seed d'exemple si calendrier vide */
  seedIfEmpty(): void {
    if (this.getEvents().length > 0) return;
    const now = new Date();
    const tomorrow = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      9,
      0,
      0
    );
    this.saveEvent({
      title: 'Revue quotidienne',
      description: 'Planifier les Unités d\'Action du jour',
      start: tomorrow.toISOString(),
      end: new Date(tomorrow.getTime() + 45 * 60 * 1000).toISOString(),
      color: '#818cf8',
    });
    const afternoon = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      14,
      0,
      0
    );
    if (afternoon.getTime() > now.getTime() - 3600000) {
      this.saveEvent({
        title: 'Deep work',
        description: 'Bloc focus',
        start: afternoon.toISOString(),
        end: new Date(afternoon.getTime() + 90 * 60 * 1000).toISOString(),
        color: '#22d3ee',
      });
    }
  }
}

export const CalendarManager = new CalendarManagerImpl();
export default CalendarManager;
