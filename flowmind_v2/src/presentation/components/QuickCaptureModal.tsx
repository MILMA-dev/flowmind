/**
 * QuickCaptureModal — Overlay global de capture rapide
 * Hotkeys : Cmd/Ctrl+K, Alt+N · Entrée valide · Maj+Entrée newline · Échap ferme
 * Équipe MILMA — Lead UI/UX
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Sparkles, Hash, Flame, CornerDownLeft, X } from 'lucide-react';
import { StateStore } from '../../core/StateStore';
import { CaptureService } from '../../core/CaptureService';
import { EventBus } from '../../core/EventBus';
import { AppEvents } from '../../core/Types';
import { extractTags, extractPriority } from '../../core/textParse';
import { useAppState } from '../../hooks/useStateStore';

function PriorityDots({ text }: { text: string }) {
  const p = extractPriority(text);
  if (p === 'none') return null;
  const label =
    p === 'critical' ? 'Critique' : p === 'high' ? 'Haute' : p === 'medium' ? 'Moyenne' : 'Basse';
  const color =
    p === 'critical'
      ? 'text-rose-400 bg-rose-500/10 border-rose-500/25'
      : p === 'high'
        ? 'text-orange-400 bg-orange-500/10 border-orange-500/25'
        : 'text-amber-400 bg-amber-500/10 border-amber-500/25';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium border ${color}`}>
      <Flame className="w-3 h-3" />
      {label}
    </span>
  );
}

export default function QuickCaptureModal() {
  const { ui } = useAppState();
  const open = ui.quickCaptureOpen;
  const [text, setText] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);

  const close = useCallback(() => {
    StateStore.setQuickCaptureOpen(false);
    setText('');
  }, []);

  const submit = useCallback(() => {
    const value = text.trim();
    if (!value) return;
    CaptureService.add(value, { source: 'quick-capture' });
    close();
  }, [text, close]);

  // Focus auto à l'ouverture
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      taRef.current?.focus();
    }, 40);
    return () => clearTimeout(t);
  }, [open]);

  // Raccourcis globaux d'ouverture
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      const isAltN = e.altKey && e.key.toLowerCase() === 'n';

      if (isModK || isAltN) {
        e.preventDefault();
        const next = !StateStore.getState().ui.quickCaptureOpen;
        StateStore.setQuickCaptureOpen(next);
        if (next) EventBus.publish(AppEvents.QUICK_CAPTURE_OPEN, { open: true });
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Échap / lock scroll
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  const tags = extractTags(text);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] sm:pt-[18vh] px-3" role="dialog" aria-modal="true" aria-label="Capture rapide">
          <motion.button
            type="button"
            aria-label="Fermer l'overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            onClick={close}
          />

          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full max-w-xl rounded-2xl border border-white/[0.1] bg-[#0e1018]/95 shadow-2xl shadow-black/50 overflow-hidden"
          >
            {/* Glow */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />

            <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100 leading-none">Capture rapide</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">Système de Capture Unit · sans quitter la zone</p>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pb-2">
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={4}
                placeholder="Déposez une pensée…  #tag  ! priorité  · Entrée pour capturer"
                className="w-full resize-none bg-white/[0.03] border border-white/[0.06] rounded-xl
                  px-3.5 py-3 text-sm text-zinc-100 placeholder:text-zinc-600 outline-none
                  focus:border-indigo-500/40 focus:ring-2 focus:ring-indigo-500/15 leading-relaxed transition-shadow"
              />
            </div>

            {/* Meta preview */}
            <div className="px-4 pb-2 flex flex-wrap items-center gap-1.5 min-h-[28px]">
              <PriorityDots text={text} />
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[10px] font-medium
                    text-violet-300 bg-violet-500/10 border border-violet-500/20"
                >
                  <Hash className="w-2.5 h-2.5" />
                  {tag}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-white/[0.06] bg-white/[0.015]">
              <div className="hidden sm:flex items-center gap-3 text-[10px] text-zinc-600">
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] font-mono text-zinc-400">↵</kbd>
                  capturer
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] font-mono text-zinc-400">⇧↵</kbd>
                  ligne
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/[0.08] font-mono text-zinc-400">esc</kbd>
                  fermer
                </span>
              </div>
              <button
                type="button"
                onClick={submit}
                disabled={!text.trim()}
                className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold
                  bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-40 disabled:pointer-events-none
                  transition-colors shadow-lg shadow-indigo-500/25"
              >
                <CornerDownLeft className="w-3.5 h-3.5" />
                Capturer
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** FAB mobile — ouvre la capture rapide */
export function CaptureFAB() {
  return (
    <button
      type="button"
      onClick={() => StateStore.setQuickCaptureOpen(true)}
      className="lg:hidden fixed z-[60] right-4 bottom-[5.25rem] w-14 h-14 rounded-2xl
        bg-gradient-to-br from-indigo-500 to-violet-600 text-white
        shadow-xl shadow-indigo-500/35 flex items-center justify-center
        active:scale-95 transition-transform border border-white/10"
      aria-label="Capture rapide"
      title="Capture rapide (Alt+N)"
    >
      <Sparkles className="w-6 h-6" strokeWidth={2} />
    </button>
  );
}
