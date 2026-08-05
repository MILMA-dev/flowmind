/**
 * Zone 4 — Calendrier & Planification
 * Mois / Semaine / Jour + Planning multi-activités (chevauchements)
 * Équipe MILMA Entreprise
 */
import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, CalendarRange } from 'lucide-react';
import { useAppState } from '../../hooks/useStateStore';
import { StateStore } from '../../core/StateStore';
import { CalendarManager } from '../../core/CalendarManager';
import { CalendarScheduler } from '../../core/CalendarScheduler';
import type { Activity, CalendarEvent, CalendarViewMode } from '../../core/Types';
import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from '../../core/calendarUtils';
import CalendarHeader from '../components/calendar/CalendarHeader';
import MonthView from '../components/calendar/MonthView';
import WeekDayView from '../components/calendar/WeekDayView';
import EventModal from '../components/calendar/EventModal';
import ActivityModal from '../components/calendar/ActivityModal';
import OverlapCalendarGrid from '../components/calendar/OverlapCalendarGrid';

export default function CalendarView() {
  const { events, workflows, ui, activities } = useAppState();
  const mode = ui.calendarViewMode ?? 'month';
  const [cursor, setCursor] = useState(() => new Date());
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [createDefaults, setCreateDefaults] = useState<
    Partial<CalendarEvent> | undefined
  >();
  const [activityOpen, setActivityOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [activityDefaults, setActivityDefaults] = useState<
    Partial<Activity> | undefined
  >();

  useEffect(() => {
    CalendarManager.seedIfEmpty();
    CalendarScheduler.seedDemoIfEmpty();
  }, []);

  const range = useMemo(() => {
    if (mode === 'month') {
      const start = startOfWeek(startOfMonth(cursor));
      const end = endOfWeek(endOfMonth(cursor));
      return { start, end };
    }
    if (mode === 'week') {
      return { start: startOfWeek(cursor), end: endOfWeek(cursor) };
    }
    if (mode === 'planning') {
      const start = startOfDay(cursor);
      return { start, end: addDays(start, 13) };
    }
    return { start: startOfDay(cursor), end: endOfDay(cursor) };
  }, [cursor, mode]);

  const visibleEvents = useMemo(
    () => CalendarManager.getEventsForRange(range.start, range.end),
    [events, range.start, range.end]
  );

  const visibleActivities = useMemo(
    () => CalendarScheduler.getActivitiesForRange(range.start, range.end),
    [activities, range.start, range.end]
  );

  const setMode = (m: CalendarViewMode) => {
    StateStore.updateUI({ calendarViewMode: m });
  };

  const prev = () => {
    setCursor((c) => {
      if (mode === 'month') return new Date(c.getFullYear(), c.getMonth() - 1, 1);
      if (mode === 'week') return addDays(c, -7);
      if (mode === 'planning') return addDays(c, -7);
      return addDays(c, -1);
    });
  };

  const next = () => {
    setCursor((c) => {
      if (mode === 'month') return new Date(c.getFullYear(), c.getMonth() + 1, 1);
      if (mode === 'week') return addDays(c, 7);
      if (mode === 'planning') return addDays(c, 7);
      return addDays(c, 1);
    });
  };

  const openCreateEvent = (partial?: Partial<CalendarEvent>) => {
    setEditing(null);
    setCreateDefaults(partial);
    setModalOpen(true);
  };

  const openEditEvent = (e: CalendarEvent) => {
    setEditing(e);
    setCreateDefaults(undefined);
    setModalOpen(true);
  };

  const openCreateActivity = (day?: Date) => {
    const d = day ?? new Date();
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const end = new Date(start);
    end.setDate(end.getDate() + 3);
    setEditingActivity(null);
    setActivityDefaults({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
    setActivityOpen(true);
  };

  const openEditActivity = (a: Activity) => {
    setEditingActivity(a);
    setActivityDefaults(undefined);
    setActivityOpen(true);
  };

  const createAtDay = (d: Date) => {
    if (mode === 'planning') {
      openCreateActivity(d);
      return;
    }
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    openCreateEvent({
      start: start.toISOString(),
      end: end.toISOString(),
    });
  };

  const createAtSlot = (day: Date, hour: number) => {
    const start = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      hour,
      0,
      0
    );
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    openCreateEvent({
      start: start.toISOString(),
      end: end.toISOString(),
    });
  };

  const eventCount =
    mode === 'planning' ? visibleActivities.length : visibleEvents.length;

  return (
    <div className="h-full flex flex-col min-h-0">
      <CalendarHeader
        cursor={cursor}
        mode={mode}
        eventCount={eventCount}
        onMode={setMode}
        onPrev={prev}
        onNext={next}
        onToday={() => setCursor(new Date())}
        onCreate={() =>
          mode === 'planning' ? openCreateActivity() : openCreateEvent()
        }
      />

      {/* Secondary actions for planning */}
      {mode !== 'planning' && (
        <div className="flex items-center gap-2 px-3 lg:px-5 py-1.5 border-b border-white/[0.04] text-[11px]">
          <button
            type="button"
            onClick={() => {
              setMode('planning');
            }}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-zinc-400
              hover:text-indigo-300 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/20 transition-colors"
          >
            <CalendarRange className="w-3.5 h-3.5" />
            Vue Planning multi-activités
          </button>
          <span className="text-zinc-600 tabular-nums ml-auto">
            {(activities ?? []).length} activité{(activities ?? []).length !== 1 ? 's' : ''} planifiée
            {(activities ?? []).length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-hidden p-3 lg:p-4 flex flex-col">
        {mode === 'planning' ? (
          <OverlapCalendarGrid
            cursor={cursor}
            activities={activities ?? []}
            workflows={workflows}
            onSelectActivity={openEditActivity}
            onCreateAt={openCreateActivity}
          />
        ) : mode === 'month' ? (
          <MonthView
            cursor={cursor}
            events={visibleEvents}
            onSelectDay={(d) => {
              setCursor(d);
              setMode('day');
            }}
            onSelectEvent={openEditEvent}
            onCreateAt={createAtDay}
          />
        ) : (
          <WeekDayView
            cursor={cursor}
            mode={mode === 'day' ? 'day' : 'week'}
            events={visibleEvents}
            onSelectEvent={openEditEvent}
            onSlotClick={createAtSlot}
          />
        )}

        {events.length === 0 && mode !== 'planning' && (
          <div className="mt-3 flex items-center justify-center gap-2 text-xs text-zinc-600 shrink-0">
            <CalendarDays className="w-3.5 h-3.5" />
            Double-cliquez une case · Planning pour activités multi-jours & workflows exclusifs
          </div>
        )}
      </div>

      <EventModal
        open={modalOpen}
        event={editing}
        defaults={createDefaults}
        workflows={workflows}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
          setCreateDefaults(undefined);
        }}
      />

      <ActivityModal
        open={activityOpen}
        activity={editingActivity}
        defaults={activityDefaults}
        workflows={workflows}
        onClose={() => {
          setActivityOpen(false);
          setEditingActivity(null);
          setActivityDefaults(undefined);
        }}
      />
    </div>
  );
}
