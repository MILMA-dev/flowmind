/**
 * MonthView — Grille mensuelle + badges événements
 */
import type { CalendarEvent } from '../../../core/Types';
import {
  WEEKDAYS_FR,
  buildMonthGrid,
  dayKey,
  eventAllDay,
  eventStart,
  isSameDay,
} from '../../../core/calendarUtils';
import { GitBranch } from 'lucide-react';

interface Props {
  cursor: Date;
  events: CalendarEvent[];
  onSelectDay: (d: Date) => void;
  onSelectEvent: (e: CalendarEvent) => void;
  onCreateAt: (d: Date) => void;
}

export default function MonthView({
  cursor,
  events,
  onSelectDay,
  onSelectEvent,
  onCreateAt,
}: Props) {
  const today = new Date();
  const cells = buildMonthGrid(cursor);

  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = dayKey(eventStart(e));
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(e);
  }

  return (
    <div className="h-full min-h-[360px] flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
      <div className="grid grid-cols-7 border-b border-white/[0.06]">
        {WEEKDAYS_FR.map((d) => (
          <div
            key={d}
            className="py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-600"
          >
            {d}
          </div>
        ))}
      </div>

      <div className="flex-1 grid grid-cols-7 auto-rows-fr">
        {cells.map((date, i) => {
          if (!date) {
            return (
              <div
                key={`e-${i}`}
                className="border-b border-r border-white/[0.03] bg-white/[0.01] min-h-[72px] lg:min-h-[88px]"
              />
            );
          }
          const key = dayKey(date);
          const dayEvents = byDay.get(key) ?? [];
          const isToday = isSameDay(date, today);

          return (
            <div
              key={key}
              className="border-b border-r border-white/[0.04] min-h-[72px] lg:min-h-[88px] p-1 lg:p-1.5
                hover:bg-white/[0.025] transition-colors flex flex-col"
              onDoubleClick={() => onCreateAt(date)}
            >
              <button
                type="button"
                onClick={() => onSelectDay(date)}
                className={`
                  self-start inline-flex items-center justify-center w-6 h-6 lg:w-7 lg:h-7 rounded-full text-xs tabular-nums mb-0.5
                  ${
                    isToday
                      ? 'bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-500/30'
                      : 'text-zinc-400 hover:bg-white/[0.06]'
                  }
                `}
              >
                {date.getDate()}
              </button>

              <div className="flex-1 space-y-0.5 overflow-hidden">
                {dayEvents.slice(0, 3).map((ev) => (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectEvent(ev);
                    }}
                    className="w-full text-left truncate rounded px-1 py-0.5 text-[9px] lg:text-[10px] font-medium
                      text-zinc-100 hover:brightness-110 transition-all flex items-center gap-0.5"
                    style={{
                      backgroundColor: `${ev.color}33`,
                      borderLeft: `2px solid ${ev.color}`,
                    }}
                    title={ev.title}
                  >
                    {ev.linkedNodeId && (
                      <GitBranch className="w-2.5 h-2.5 shrink-0 opacity-80" />
                    )}
                    <span className="truncate">
                      {!eventAllDay(ev) && (
                        <span className="opacity-70 mr-0.5">
                          {eventStart(ev).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      )}
                      {ev.title}
                    </span>
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <p className="text-[9px] text-zinc-600 px-1">
                    +{dayEvents.length - 3}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
