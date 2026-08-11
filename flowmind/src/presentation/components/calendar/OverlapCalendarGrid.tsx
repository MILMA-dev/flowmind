/**
 * OverlapCalendarGrid — Planning multi-pistes (stacked rows)
 * Activités simultanées / entrelacées sans masquer le texte
 * Équipe MILMA — Sous-Prompt 11B
 */
import { useMemo } from 'react';
import { GitBranch, Lock, Plus } from 'lucide-react';
import type { Activity, Workflow } from '../../../core/Types';
import { CalendarScheduler } from '../../../core/CalendarScheduler';
import {
  MONTHS_FR,
  WEEKDAYS_FR,
  addDays,
  dayKey,
  isSameDay,
  startOfDay,
} from '../../../core/calendarUtils';

interface Props {
  cursor: Date;
  /** Nombre de jours affichés (défaut 14) */
  dayCount?: number;
  activities: Activity[];
  workflows: Workflow[];
  onSelectActivity: (a: Activity) => void;
  onCreateAt: (day: Date) => void;
}

const LANE_H = 44; // hauteur piste — lisibilité texte

export default function OverlapCalendarGrid({
  cursor,
  dayCount = 14,
  activities,
  workflows,
  onSelectActivity,
  onCreateAt,
}: Props) {
  const rangeStart = useMemo(() => startOfDay(cursor), [cursor]);
  const rangeEnd = useMemo(
    () => addDays(rangeStart, dayCount - 1),
    [rangeStart, dayCount]
  );
  // borne exclusive pour layout %
  const rangeEndExclusive = useMemo(
    () => addDays(rangeEnd, 1),
    [rangeEnd]
  );

  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addDays(rangeStart, i)),
    [rangeStart, dayCount]
  );

  const inRange = useMemo(
    () => CalendarScheduler.getActivitiesForRange(rangeStart, rangeEnd),
    [activities, rangeStart, rangeEnd]
  );

  const layouts = useMemo(
    () =>
      CalendarScheduler.computeLanes(inRange, rangeStart, rangeEndExclusive),
    [inRange, rangeStart, rangeEndExclusive]
  );

  const laneCount = Math.max(...layouts.map((l) => l.laneCount), 1);
  const trackH = laneCount * LANE_H + 16;
  const today = new Date();

  const wfMap = useMemo(() => {
    const m = new Map(workflows.map((w) => [w.id, w]));
    return m;
  }, [workflows]);

  const layoutOf = useMemo(() => {
    const m = new Map(layouts.map((l) => [l.activityId, l]));
    return m;
  }, [layouts]);

  return (
    <div className="h-full min-h-0 flex flex-col rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
      {/* Header days */}
      <div className="overflow-x-auto shrink-0 border-b border-white/[0.06]">
        <div
          className="grid min-w-[800px]"
          style={{
            gridTemplateColumns: `repeat(${dayCount}, minmax(56px, 1fr))`,
          }}
        >
          {days.map((d) => {
            const todayCol = isSameDay(d, today);
            return (
              <button
                key={dayKey(d)}
                type="button"
                onDoubleClick={() => onCreateAt(d)}
                className={`py-2 px-0.5 text-center border-r border-white/[0.04] last:border-r-0 transition-colors hover:bg-white/[0.03] ${
                  todayCol ? 'bg-indigo-500/[0.08]' : ''
                }`}
              >
                <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
                  {WEEKDAYS_FR[d.getDay() === 0 ? 6 : d.getDay() - 1]}
                </p>
                <p
                  className={`text-sm font-semibold tabular-nums mt-0.5 ${
                    todayCol ? 'text-indigo-300' : 'text-zinc-200'
                  }`}
                >
                  {d.getDate()}
                </p>
                <p className="text-[9px] text-zinc-600 hidden sm:block">
                  {MONTHS_FR[d.getMonth()].slice(0, 3)}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tracks / stacked rows */}
      <div className="flex-1 overflow-auto relative">
        <div
          className="min-w-[800px] relative"
          style={{ minHeight: Math.max(trackH + 48, 180) }}
        >
          {/* Day columns + lane gridlines */}
          <div
            className="absolute inset-0 grid pointer-events-none"
            style={{
              gridTemplateColumns: `repeat(${dayCount}, minmax(56px, 1fr))`,
            }}
          >
            {days.map((d) => (
              <div
                key={dayKey(d)}
                className={`border-r border-white/[0.04] last:border-r-0 relative ${
                  isSameDay(d, today) ? 'bg-indigo-500/[0.04]' : ''
                }`}
              >
                {/* horizontal lane guides */}
                {Array.from({ length: laneCount }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute left-0 right-0 border-b border-dashed border-white/[0.03]"
                    style={{ top: 8 + (i + 1) * LANE_H }}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* Click empty → create */}
          <button
            type="button"
            className="absolute inset-0 w-full h-full opacity-0 cursor-crosshair z-[1]"
            aria-label="Créer une activité"
            onClick={(e) => {
              const rect = (
                e.currentTarget as HTMLElement
              ).getBoundingClientRect();
              const x = e.clientX - rect.left;
              const pct = x / rect.width;
              const dayIndex = Math.min(
                dayCount - 1,
                Math.max(0, Math.floor(pct * dayCount))
              );
              onCreateAt(days[dayIndex]);
            }}
          />

          {/* Activity bars — stacked, full text visible */}
          <div
            className="relative z-10 px-1 py-2"
            style={{ height: trackH }}
          >
            {inRange.map((act) => {
              const layout = layoutOf.get(act.id);
              if (!layout) return null;
              const wf = act.workflowId ? wfMap.get(act.workflowId) : null;
              return (
                <button
                  key={act.id}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectActivity(act);
                  }}
                  className="absolute rounded-lg px-2.5 py-1.5 text-left overflow-hidden
                    border border-white/15 hover:brightness-110 hover:z-20 transition-all
                    shadow-lg backdrop-blur-[2px] group"
                  style={{
                    left: `calc(${layout.leftPct}% + 2px)`,
                    width: `calc(${layout.widthPct}% - 4px)`,
                    top: 6 + layout.lane * LANE_H,
                    height: LANE_H - 8,
                    background: `linear-gradient(135deg, ${act.color}55, ${act.color}28)`,
                    boxShadow: `inset 3px 0 0 ${act.color}, 0 4px 14px -6px ${act.color}66`,
                  }}
                  title={`${act.title}${wf ? ` · ${wf.title}` : ''}`}
                >
                  <div className="flex items-start gap-1.5 h-full">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-zinc-50 truncate leading-tight">
                        {act.title}
                      </p>
                      <p className="text-[9px] text-zinc-200/75 truncate mt-0.5 flex items-center gap-1">
                        {wf ? (
                          <>
                            <Lock className="w-2.5 h-2.5 shrink-0 text-amber-300/90" />
                            <GitBranch className="w-2.5 h-2.5 shrink-0 opacity-80" />
                            <span className="truncate">{wf.title}</span>
                          </>
                        ) : (
                          <span className="opacity-60">Sans workflow</span>
                        )}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {inRange.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
              <p className="text-sm text-zinc-500 mb-2">
                Aucune activité sur cette période
              </p>
              <p className="text-[11px] text-zinc-600 flex items-center gap-1">
                <Plus className="w-3 h-3" /> Cliquez pour planifier ·
                chevauchements en pistes parallèles
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="shrink-0 px-3 py-2 border-t border-white/[0.05] flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-600">
        <span className="tabular-nums">
          {inRange.length} activité{inRange.length !== 1 ? 's' : ''}
        </span>
        <span className="opacity-40">·</span>
        <span className="tabular-nums">
          {laneCount} piste{laneCount !== 1 ? 's' : ''} parallèle
          {laneCount !== 1 ? 's' : ''}
        </span>
        <span className="opacity-40">·</span>
        <span className="inline-flex items-center gap-1">
          <Lock className="w-3 h-3 text-amber-400/80" />
          {inRange.filter((a) => a.workflowId).length} réservation
          {inRange.filter((a) => a.workflowId).length !== 1 ? 's' : ''} WF
        </span>
        <span className="opacity-40 hidden sm:inline">·</span>
        <span className="hidden sm:inline text-zinc-600">
          Overlap = (StartA ≤ EndB) ∧ (EndA ≥ StartB)
        </span>
      </div>
    </div>
  );
}
