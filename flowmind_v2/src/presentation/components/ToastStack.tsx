/**
 * Notifications discrètes — réaction aux événements TOAST_SHOW
 */
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';
import { EventBus } from '../../core/EventBus';
import { AppEvents, type ToastMessage } from '../../core/Types';

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
};

const COLORS = {
  success: 'text-emerald-400 border-emerald-500/25 bg-emerald-500/10',
  info: 'text-sky-400 border-sky-500/25 bg-sky-500/10',
  warning: 'text-amber-400 border-amber-500/25 bg-amber-500/10',
  error: 'text-rose-400 border-rose-500/25 bg-rose-500/10',
};

export default function ToastStack() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    EventBus.publish(AppEvents.TOAST_DISMISS, { id });
  }, []);

  useEffect(() => {
    const unsub = EventBus.subscribe(AppEvents.TOAST_SHOW, (payload) => {
      const t = payload as ToastMessage;
      if (!t?.id) return;
      setToasts((prev) => [...prev.slice(-4), t]);
      const duration = t.duration ?? 3000;
      if (duration > 0) {
        window.setTimeout(() => dismiss(t.id), duration);
      }
    });
    return unsub;
  }, [dismiss]);

  return (
    <div className="fixed top-4 right-4 z-[80] flex flex-col gap-2 pointer-events-none w-[min(100vw-2rem,360px)]">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const Icon = ICONS[t.type] ?? Info;
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-3.5 py-3 shadow-xl shadow-black/40 backdrop-blur-xl bg-[#0c0d12]/95 ${
                COLORS[t.type]
              }`}
            >
              <Icon className="w-4.5 h-4.5 shrink-0 mt-0.5" strokeWidth={2} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-100 leading-tight">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-zinc-400 mt-0.5 truncate">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/5 transition-colors"
                aria-label="Fermer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
