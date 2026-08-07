/**
 * RecurrenceConfigurator — Réglages de récurrence (routines)
 * Équipe MILMA — Lead UI/UX
 */
import { RefreshCw, Clock } from 'lucide-react';
import {
  type RecurrenceFrequency,
  type RecurrenceIntervalUnit,
  type RecurrenceOnComplete,
  type RecurrenceRule,
} from '../../../core/Types';
import { recurrenceLabel } from '../../../core/RecurrenceEngine';

const FREQUENCIES: { id: RecurrenceFrequency; label: string }[] = [
  { id: 'none', label: 'Aucune' },
  { id: 'daily', label: 'Quotidienne' },
  { id: 'weekly', label: 'Hebdomadaire' },
  { id: 'monthly', label: 'Mensuelle' },
  { id: 'custom', label: 'Personnalisée' },
];

interface Props {
  rule: RecurrenceRule;
  onChange: (partial: Partial<RecurrenceRule>) => void;
  highlight?: boolean;
}

export default function RecurrenceConfigurator({ rule, onChange, highlight }: Props) {
  const active = rule.enabled && rule.frequency !== 'none';

  return (
    <section className={`fm-inspector-section ${highlight ? 'ring-1 ring-cyan-500/20 rounded-xl' : ''}`}>
      <header className="flex items-center gap-2 mb-3">
        <RefreshCw className={`w-3.5 h-3.5 ${active ? 'text-cyan-400' : 'text-zinc-500'}`} />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Récurrence
        </h3>
        {active && (
          <span className="ml-auto text-[10px] font-medium text-cyan-300/90 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded-md">
            {recurrenceLabel(rule)}
          </span>
        )}
      </header>

      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {FREQUENCIES.map((f) => {
          const selected = rule.frequency === f.id || (!active && f.id === 'none');
          return (
            <button
              key={f.id}
              type="button"
              onClick={() =>
                onChange({
                  frequency: f.id,
                  enabled: f.id !== 'none',
                })
              }
              className={`px-2.5 py-2 rounded-lg text-[11px] font-medium border transition-colors text-left ${
                selected
                  ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-200'
                  : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {rule.frequency === 'custom' && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[11px] text-zinc-500 shrink-0">Tous les</span>
          <input
            type="number"
            min={1}
            max={365}
            value={rule.interval}
            onChange={(e) =>
              onChange({ interval: Math.max(1, Number(e.target.value) || 1) })
            }
            className="w-16 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-100 outline-none focus:border-cyan-500/40"
          />
          <select
            value={rule.intervalUnit}
            onChange={(e) =>
              onChange({ intervalUnit: e.target.value as RecurrenceIntervalUnit })
            }
            className="flex-1 px-2 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-200 outline-none"
          >
            <option value="hours">heures</option>
            <option value="days">jours</option>
          </select>
        </div>
      )}

      {active && (
        <>
          <p className="text-[10px] font-medium text-zinc-500 mb-1.5">À l'échéance</p>
          <div className="flex gap-1.5 mb-3">
            {(
              [
                { id: 'reset' as RecurrenceOnComplete, label: 'Réinit. sous-tâches' },
                { id: 'duplicate' as RecurrenceOnComplete, label: 'Dupliquer (journal)' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange({ onComplete: opt.id })}
                className={`flex-1 px-2 py-2 rounded-lg text-[10px] font-medium border transition-colors ${
                  rule.onComplete === opt.id
                    ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200'
                    : 'bg-white/[0.02] border-white/[0.06] text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-white/[0.025] border border-white/[0.05] px-2.5 py-2">
            <Clock className="w-3.5 h-3.5 text-zinc-500 mt-0.5 shrink-0" />
            <div className="text-[10px] text-zinc-500 leading-relaxed min-w-0">
              {rule.nextRunAt ? (
                <>
                  Prochaine occurrence :{' '}
                  <span className="text-zinc-300 font-medium">
                    {new Date(rule.nextRunAt).toLocaleString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </>
              ) : (
                'En attente de planification…'
              )}
              {rule.lastRunAt && (
                <span className="block mt-0.5 text-zinc-600">
                  Dernière :{' '}
                  {new Date(rule.lastRunAt).toLocaleString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
