/**
 * WeekDayView — Grille temporelle heure par heure (Semaine / Jour)
 * Positionnement top/height selon start/end
 */
import { useMemo, useRef, useEffect } from 'react';
import { GitBranch } from 'lucide-react';
import type { CalendarEvent } from '../../../core/Types';
import {
  HOUR_HEIGHT,
  WEEKDAYS_FR,
  dayKey,
  eventAllDay,
  eventEnd,
  eventLayout,
  eventStart,
  formatTime,
  isSameDay,
  weekDays,
} from '../../../core/calendarUtils';

interface Props {
  cursor: Date;
  mode: 'week' | 'day';
  events: CalendarEvent[];
  onSelectEvent: (e: CalendarEvent) => void;
  onSlotClick: (day: Date, hour: number) => void;
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export default function WeekDayView({
  cursor,
  mode,
  events,
  onSelectEvent,
  onSlotClick,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();
  const days = mode === 'day' ? [new Date(cursor)] : weekDays(cursor);

  useEffect(() => {
    // Scroll vers 7h
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 7 * HOUR_HEIGHT - 20;
    }
  }, [mode, cursor]);

  const allDayByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const d of days) map.set(dayKey(d), []);
    for (const e of events) {
      if (!eventAllDay(e)) continue;
      const k = dayKey(eventStart(e));
      if (map.has(k)) map.get(k)!.push(e);
    }
    return map;
  }, [events, days]);

  const timedByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const d of days) map.set(dayKey(d), []);
    for (const e of events) {
      if (eventAllDay(e)) continue;
      const k = dayKey(eventStart(e));
      if (map.has(k)) map.get(k)!.push(e);
    }
    return map;
  }, [events, days]);

  const nowTop = useMemo(() => {
    const n = new Date();
    return ((n.getHours() * 60 + n.getMinutes()) / 60) * HOUR_HEIGHT;
  }, []);

  const colCount = days.length;

  return (
    <div className="h-full min-h-0 flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
      {/* Day headers */}
      <div
        className="grid border-b border-white/[0.06] shrink-0"
        style={{ gridTemplateColumns: `56px repeat(${colCount}, minmax(0, 1fr))` }}
      >
        <div className="border-r border-white/[0.04]" />
        {days.map((d) => {
          const todayCol = isSameDay(d, today);
          return (
            <div
              key={dayKey(d)}
              className={`py-2 text-center border-r border-white/[0.04] last:border-r-0 ${
                todayCol ? 'bg-indigo-500/[0.06]' : ''
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
                {WEEKDAYS_FR[d.getDay() === 0 ? 6 : d.getDay() - 1]}
              </p>
              <p
                className={`text-sm font-semibold tabular-nums mt-0.5 ${
                  todayCol ? 'text-indigo-300' : 'text-zinc-200'
                }`}
              >
                {d.getDate()}
              </p>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      <div
        className="grid border-b border-white/[0.06] shrink-0 min-h-[36px]"
        style={{ gridTemplateColumns: `56px repeat(${colCount}, minmax(0, 1fr))` }}
      >
        <div className="text-[9px] text-zinc-600 px-1 py-1 border-r border-white/[0.04] flex items-start">
          Journée
        </div>
        {days.map((d) => {
          const list = allDayByDay.get(dayKey(d)) ?? [];
          return (
            <div
              key={dayKey(d)}
              className="border-r border-white/[0.04] last:border-r-0 px-0.5 py-0.5 space-y-0.5"
            >
              {list.map((ev) => (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => onSelectEvent(ev)}
                  className="w-full text-left truncate rounded px-1 py-0.5 text-[10px] font-medium text-zinc-100"
                  style={{
                    backgroundColor: `${ev.color}40`,
                    borderLeft: `2px solid ${ev.color}`,
                  }}
                >
                  {ev.linkedNodeId && (
                    <GitBranch className="w-2.5 h-2.5 inline mr-0.5 opacity-80" />
                  )}
                  {ev.title}
                </button>
              ))}
            </div>
          );
        })}
      </div>

      {/* Scrollable hours */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          className="grid relative"
          style={{
            gridTemplateColumns: `56px repeat(${colCount}, minmax(0, 1fr))`,
            height: 24 * HOUR_HEIGHT,
          }}
        >
          {/* Time gutter */}
          <div className="relative border-r border-white/[0.04]">
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-1 text-[10px] text-zinc-600 tabular-nums -translate-y-1/2"
                style={{ top: h * HOUR_HEIGHT }}
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d) => {
            const key = dayKey(d);
            const timed = timedByDay.get(key) ?? [];
            const showNow = isSameDay(d, today);

            return (
              <div
                key={key}
                className="relative border-r border-white/[0.04] last:border-r-0"
              >
                {/* Hour lines + click targets */}
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => onSlotClick(d, h)}
                    className="absolute left-0 right-0 border-t border-white/[0.04] hover:bg-indigo-500/[0.04] transition-colors"
                    style={{ top: h * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                    aria-label={`${formatTime(new Date(d.getFullYear(), d.getMonth(), d.getDate(), h))}`}
                  />
                ))}

                {/* Now line */}
                {showNow && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                    style={{ top: nowTop }}
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500 -ml-1" />
                    <span className="flex-1 h-px bg-rose-500/80" />
                  </div>
                )}

                {/* Events */}
                {timed.map((ev) => {
                  const { top, height } = eventLayout(ev);
                  const conflicts = timed.filter((other) => {
                    if (other.id === ev.id) return false;
                    return (
                      eventStart(ev) < eventEnd(other) &&
                      eventStart(other) < eventEnd(ev)
                    );
                  });
                  const hasConflict = conflicts.length > 0;

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(ev);
                      }}
                      className={`absolute left-0.5 right-0.5 z-10 rounded-md px-1.5 py-1 text-left overflow-hidden
                        border transition-shadow hover:brightness-110 ${
                          hasConflict ? 'ring-1 ring-rose-400/50' : ''
                        }`}
                      style={{
                        top,
                        height,
                        backgroundColor: `${ev.color}30`,
                        borderColor: `${ev.color}88`,
                        boxShadow: `inset 3px 0 0 ${ev.color}`,
                      }}
                    >
                      <p className="text-[10px] font-semibold text-zinc-100 truncate flex items-center gap-0.5">
                        {ev.linkedNodeId && (
                          <GitBranch className="w-2.5 h-2.5 shrink-0 text-indigo-300" />
                        )}
                        {ev.title}
                      </p>
                      {height > 36 && (
                        <p className="text-[9px] text-zinc-400 tabular-nums mt-0.5">
                          {formatTime(eventStart(ev))} – {formatTime(eventEnd(ev))}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
