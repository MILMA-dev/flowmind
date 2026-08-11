/**
 * SettingsView — Thèmes, stockage, export/import, accessibilité
 * Équipe MILMA Entreprise
 */
import { useEffect, useState } from 'react';
import {
  Download,
  HardDrive,
  Moon,
  Palette,
  RotateCcw,
  Settings2,
  Smartphone,
  Sparkles,
  Upload,
  Zap,
} from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';
import { BackupService } from '../../core/BackupService';
import { StateStore } from '../../core/StateStore';
import { useAppState } from '../../hooks/useStateStore';
import BackupModal from '../components/settings/BackupModal';

function formatBytes(n: number): string {
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(2)} Mo`;
}

export default function SettingsView() {
  const { themeId, setTheme, presets, reduceMotion, setReduceMotion } =
    useTheme();
  const { ui } = useAppState();
  const [backupOpen, setBackupOpen] = useState(false);
  const stats = BackupService.getStorageStats();
  const [quota, setQuota] = useState<{ usage: number; quota: number } | null>(
    null
  );

  useEffect(() => {
    void BackupService.getQuota().then(setQuota);
  }, [ui]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 lg:px-6 py-6 space-y-8">
        <header>
          <div className="flex items-center gap-2 text-indigo-300 mb-1">
            <Settings2 className="w-4 h-4" />
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em]">
              Paramètres
            </span>
          </div>
          <h1 className="text-xl font-semibold text-[var(--fm-text,#f4f4f5)] tracking-tight">
            FlowMind · Préférences
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            Thèmes, sauvegarde JSON, feedback tactile et stockage local.
          </p>
        </header>

        {/* Thèmes */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Palette className="w-4 h-4 text-zinc-500" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Apparence
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {presets.map((p) => {
              const active = themeId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTheme(p.id)}
                  className={`text-left rounded-2xl border p-3 transition-all ${
                    active
                      ? 'border-indigo-500/50 bg-indigo-500/10 ring-1 ring-indigo-500/30'
                      : 'border-[var(--fm-border,rgba(255,255,255,0.06))] bg-white/[0.02] hover:bg-white/[0.04]'
                  }`}
                >
                  <div
                    className="w-full h-12 rounded-xl mb-2 border border-white/10"
                    style={{ background: p.preview }}
                  />
                  <p className="text-xs font-semibold text-[var(--fm-text,#f4f4f5)]">
                    {p.label}
                  </p>
                  <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">
                    {p.description}
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Feedback */}
        <section className="rounded-2xl border border-[var(--fm-border,rgba(255,255,255,0.06))] bg-white/[0.02] divide-y divide-white/[0.05]">
          <ToggleRow
            icon={<Sparkles className="w-4 h-4" />}
            title="Micro-animations"
            description="Confettis à la complétion d'Unités et de nœuds"
            checked={ui.microFeedback !== false}
            onChange={(v) => StateStore.updateUI({ microFeedback: v })}
          />
          <ToggleRow
            icon={<Zap className="w-4 h-4" />}
            title="Réduire les mouvements"
            description="Désactive transitions et bursts (accessibilité)"
            checked={reduceMotion}
            onChange={setReduceMotion}
          />
          <ToggleRow
            icon={<Moon className="w-4 h-4" />}
            title="Densité compacte"
            description="UI plus dense sur petits écrans"
            checked={ui.density === 'compact'}
            onChange={(v) =>
              StateStore.updateUI({ density: v ? 'compact' : 'comfortable' })
            }
          />
        </section>

        {/* Stockage */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <HardDrive className="w-4 h-4 text-zinc-500" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Stockage local
            </h2>
          </div>
          <div className="rounded-2xl border border-[var(--fm-border,rgba(255,255,255,0.06))] bg-white/[0.02] p-4">
            <div className="flex items-end justify-between gap-3 mb-3">
              <div>
                <p className="text-2xl font-semibold tabular-nums text-[var(--fm-text,#f4f4f5)]">
                  {formatBytes(stats.usedBytes)}
                </p>
                <p className="text-[11px] text-zinc-500">
                  État applicatif sérialisé · {stats.itemCount} entités
                </p>
              </div>
              {quota && (
                <p className="text-[10px] text-zinc-600 text-right">
                  Quota navigateur
                  <br />
                  <span className="tabular-nums text-zinc-400">
                    {formatBytes(quota.usage)} / {formatBytes(quota.quota)}
                  </span>
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {Object.entries(stats.breakdown).map(([k, v]) => (
                <div
                  key={k}
                  className="rounded-xl bg-white/[0.03] border border-white/[0.05] px-2 py-2 text-center"
                >
                  <p className="text-sm font-semibold tabular-nums text-zinc-200">
                    {v}
                  </p>
                  <p className="text-[9px] text-zinc-600 truncate">{k}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Backup */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Download className="w-4 h-4 text-zinc-500" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Export / Import
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void BackupService.exportData()}
              className="flex items-center gap-3 rounded-2xl border border-indigo-500/25 bg-indigo-500/10
                px-4 py-3.5 text-left hover:bg-indigo-500/15 transition-colors"
            >
              <Download className="w-5 h-5 text-indigo-300 shrink-0" />
              <div>
                <p className="text-sm font-medium text-indigo-100">
                  Exporter JSON
                </p>
                <p className="text-[11px] text-indigo-300/70">
                  flowmind-backup-[date].json
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setBackupOpen(true)}
              className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.02]
                px-4 py-3.5 text-left hover:bg-white/[0.04] transition-colors"
            >
              <Upload className="w-5 h-5 text-zinc-400 shrink-0" />
              <div>
                <p className="text-sm font-medium text-[var(--fm-text,#f4f4f5)]">
                  Restaurer
                </p>
                <p className="text-[11px] text-zinc-500">
                  Importer une sauvegarde validée
                </p>
              </div>
            </button>
          </div>
        </section>

        {/* Mobile / PWA */}
        <section className="rounded-2xl border border-[var(--fm-border,rgba(255,255,255,0.06))] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 mb-2">
            <Smartphone className="w-4 h-4 text-zinc-500" />
            <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Mobile & PWA
            </h2>
          </div>
          <ul className="text-xs text-zinc-500 space-y-1.5 leading-relaxed">
            <li>· Swipe gauche sur une Capture Unit pour archiver (mobile)</li>
            <li>· Pinch-to-zoom sur le Canvas des Workflows Nodaux</li>
            <li>· Installable en PWA (manifest + thème dynamique)</li>
            <li>· Export File System Access API (Chromium / Electron)</li>
          </ul>
        </section>

        {/* Danger */}
        <section>
          <button
            type="button"
            onClick={() => {
              if (
                confirm(
                  'Réinitialiser toutes les données locales FlowMind ? Cette action est irréversible.'
                )
              ) {
                void BackupService.resetAll();
              }
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-rose-300/90
              border border-rose-500/20 hover:bg-rose-500/10 transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Réinitialiser l'application
          </button>
        </section>

        <p className="text-[10px] text-zinc-600 pb-8 text-center">
          FlowMind Personal OS · MILMA Entreprise · v1.0
        </p>
      </div>

      <BackupModal open={backupOpen} onClose={() => setBackupOpen(false)} />
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-zinc-500">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--fm-text,#f4f4f5)]">
          {title}
        </p>
        <p className="text-[11px] text-zinc-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors shrink-0 ${
          checked ? 'bg-indigo-500' : 'bg-white/10'
        }`}
      >
        <span
          className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </button>
    </div>
  );
}
