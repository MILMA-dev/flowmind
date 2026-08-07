/**
 * CalendarHeader — Navigation + bascule Mois | Semaine | Jour
 */
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import type { CalendarViewMode } from '../../../core/Types';
import { MONTHS_FR, formatDayLabel, startOfWeek } from '../../../core/calendarUtils';

interface Props {
  cursor: Date;
  mode: CalendarViewMode;
  eventCount: number;
  onMode: (m: CalendarViewMode) => void;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onCreate: () => void;
}

function titleFor(cursor: Date, mode: CalendarViewMode): string {
  if (mode === 'month') {
    return `${MONTHS_FR[cursor.getMonth()]} ${cursor.getFullYear()}`;
  }
  if (mode === 'day') {
    return formatDayLabel(cursor, true);
  }
  if (mode === 'planning') {
    const end = new Date(cursor);
    end.setDate(end.getDate() + 13);
    return `Planning · ${cursor.getDate()} ${MONTHS_FR[cursor.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTHS_FR[end.getMonth()].slice(0, 3)}`;
  }
  // week
  const start = startOfWeek(cursor);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()} – ${end.getDate()} ${MONTHS_FR[start.getMonth()]} ${start.getFullYear()}`;
  }
  return `${start.getDate()} ${MONTHS_FR[start.getMonth()].slice(0, 3)} – ${end.getDate()} ${MONTHS_FR[end.getMonth()].slice(0, 3)} ${end.getFullYear()}`;
}

export default function CalendarHeader({
  cursor,
  mode,
  eventCount,
  onMode,
  onPrev,
  onNext,
  onToday,
  onCreate,
}: Props) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-3 lg:px-5 py-2.5 border-b border-white/[0.06] bg-[#0a0b10]/50">
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          type="button"
          onClick={onPrev}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] transition-colors"
          aria-label="Précédent"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h2 className="text-sm font-semibold text-zinc-100 min-w-0 truncate capitalize px-1">
          {titleFor(cursor, mode)}
        </h2>
        <button
          type="button"
          onClick={onNext}
          className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.05] transition-colors"
          aria-label="Suivant"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onToday}
          className="ml-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-zinc-400
            border border-white/[0.08] hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
        >
          Aujourd'hui
        </button>
      </div>

      <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
        <div className="flex items-center p-0.5 rounded-lg bg-white/[0.03] border border-white/[0.08]">
          {([
            { id: 'month' as const, label: 'Mois' },
            { id: 'week' as const, label: 'Semaine' },
            { id: 'day' as const, label: 'Jour' },
            { id: 'planning' as const, label: 'Planning' },
          ]).map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onMode(v.id)}
              className={`px-2.5 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                mode === v.id
                  ? 'bg-indigo-500/20 text-indigo-200'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        <span className="hidden md:inline text-[11px] text-zinc-600 tabular-nums">
          {eventCount} événement{eventCount !== 1 ? 's' : ''}
        </span>

        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
            bg-indigo-500/15 text-indigo-300 border border-indigo-500/25
            hover:bg-indigo-500/25 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Planifier
        </button>
      </div>
    </div>
  );
}
