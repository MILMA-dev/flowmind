/**
 * BackupModal — Upload / Download sauvegardes JSON
 */
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Download,
  Upload,
  X,
  FileJson,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import { BackupService } from '../../../core/BackupService';

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function BackupModal({ open, onClose }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const exportBackup = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await BackupService.exportData();
      if (r.bytes > 0) {
        setMessage({ type: 'ok', text: `Exporté : ${r.filename}` });
      }
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await BackupService.importData(file);
      if (res.ok) {
        setMessage({ type: 'ok', text: 'Restauration réussie' });
        window.setTimeout(() => onClose(), 800);
      } else {
        setMessage({ type: 'err', text: res.errors.join(' · ') });
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center px-4">
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-label="Fermer"
          />
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className="relative w-full max-w-md rounded-2xl border border-white/[0.1]
              bg-[var(--fm-surface-1,#0e1018)] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <FileJson className="w-4 h-4 text-indigo-400" />
                <h3 className="text-sm font-semibold text-[var(--fm-text,#f4f4f5)]">
                  Sauvegarde JSON
                </h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-zinc-500 leading-relaxed">
                Exportez l'intégralité de votre Personal OS (Workflows, Notes,
                Listes, Calendrier, Captures) ou restaurez un fichier{' '}
                <code className="text-indigo-300/80">flowmind-backup-*.json</code>.
              </p>

              <button
                type="button"
                disabled={busy}
                onClick={exportBackup}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                  bg-indigo-500/15 text-indigo-200 border border-indigo-500/30
                  hover:bg-indigo-500/25 text-sm font-medium disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Exporter mes données JSON
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                  bg-white/[0.03] text-zinc-200 border border-white/[0.08]
                  hover:bg-white/[0.06] text-sm font-medium disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                Restaurer un fichier JSON
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />

              {message && (
                <div
                  className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs border ${
                    message.type === 'ok'
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
                      : 'bg-rose-500/10 border-rose-500/25 text-rose-200'
                  }`}
                >
                  {message.type === 'ok' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  )}
                  {message.text}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
