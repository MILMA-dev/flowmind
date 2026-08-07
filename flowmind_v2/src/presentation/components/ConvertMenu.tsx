/**
 * Menu « Convertir en… » pour une Capture Unit
 * Dispatch via ConversionService (EventBus)
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  GitBranch,
  StickyNote,
  ListChecks,
  CalendarDays,
  Check,
} from 'lucide-react';
import { ConversionService } from '../../core/ConversionService';
import type { ConversionTarget } from '../../core/Types';
import { CONVERSION_LABELS } from '../../core/Types';

const OPTIONS: {
  type: ConversionTarget;
  icon: React.ReactNode;
  hint: string;
}[] = [
  {
    type: 'task',
    icon: <ListChecks className="w-3.5 h-3.5" />,
    hint: "Unité d'Action autonome",
  },
  {
    type: 'note',
    icon: <StickyNote className="w-3.5 h-3.5" />,
    hint: 'Transfert vers Notes Dek',
  },
  {
    type: 'event',
    icon: <CalendarDays className="w-3.5 h-3.5" />,
    hint: 'Bloc planifié (demain 9h)',
  },
  {
    type: 'workflow',
    icon: <GitBranch className="w-3.5 h-3.5" />,
    hint: 'Nœud Action de workflow',
  },
];

interface Props {
  itemId: string;
  disabled?: boolean;
  compact?: boolean;
}

export default function ConvertMenu({ itemId, disabled, compact }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = () => {
    if (disabled) return;
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const menuW = 220;
      let left = r.right - menuW;
      if (left < 8) left = 8;
      if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
      let top = r.bottom + 6;
      if (top + 220 > window.innerHeight) top = r.top - 226;
      setPos({ top, left });
    }
    setOpen((v) => !v);
  };

  const convert = (type: ConversionTarget) => {
    setOpen(false);
    ConversionService.convertItem(itemId, type);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className={`inline-flex items-center gap-1 rounded-lg text-xs font-medium transition-colors
          disabled:opacity-40 disabled:pointer-events-none
          ${
            compact
              ? 'px-2 py-1 text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20'
              : 'px-2.5 py-1.5 text-indigo-300 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20'
          }`}
      >
        Convertir
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[90] w-[220px] rounded-xl border border-white/[0.1] bg-[#12141c]/98
              backdrop-blur-xl shadow-2xl shadow-black/50 py-1.5 overflow-hidden"
          >
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Convertir en…
            </p>
            {OPTIONS.map((opt) => (
              <button
                key={opt.type}
                type="button"
                onClick={() => convert(opt.type)}
                className="flex items-start gap-2.5 w-full px-3 py-2 text-left hover:bg-white/[0.05] transition-colors"
              >
                <span className="mt-0.5 text-zinc-400">{opt.icon}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-zinc-100">
                    {CONVERSION_LABELS[opt.type]}
                  </span>
                  <span className="block text-[10px] text-zinc-500">{opt.hint}</span>
                </span>
                <Check className="w-3 h-3 text-transparent ml-auto mt-1" />
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
