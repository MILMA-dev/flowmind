/**
 * Zone 5 — Brain Dump & Inbox (Système de Capture Unit)
 * Interface complète : capture, filtres tags, conversion multi-cibles
 * Équipe MILMA Entreprise
 */
import { useMemo, useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Inbox,
  Sparkles,
  ArrowRight,
  Hash,
  Pencil,
  Trash2,
  Flame,
  Search,
  Filter,
  X,
  Check,
  Archive,
  Clock,
} from 'lucide-react';
import { useAppState } from '../../hooks/useStateStore';
import { CaptureService } from '../../core/CaptureService';
import type { BrainDumpItem, CapturePriority } from '../../core/Types';
import ConvertMenu from '../components/ConvertMenu';
import { UniversalConverter } from '../../core/UniversalConverter';
import { useUniversalDraggable } from '../../hooks/useUniversalDraggable';
import { useSwipeAction } from '../../hooks/useTouchGestures';

const PRIORITY_STYLE: Record<
  CapturePriority,
  { label: string; className: string } | null
> = {
  none: null,
  low: { label: 'Basse', className: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20' },
  medium: { label: 'Moyenne', className: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  high: { label: 'Haute', className: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  critical: { label: 'Critique', className: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
};

type StatusFilter = 'active' | 'all' | 'converted' | 'archived';

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `il y a ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 7) return `il y a ${days} j`;
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

function CaptureComposer({
  onSubmit,
}: {
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    onSubmit(v);
    setText('');
    ref.current?.focus();
  };

  return (
    <div className="relative rounded-2xl border border-indigo-500/25 bg-gradient-to-b from-indigo-500/[0.08] to-transparent p-1 shadow-lg shadow-indigo-500/5">
      <div className="rounded-xl bg-[#0c0d12]/80 border border-white/[0.06] overflow-hidden">
        <textarea
          ref={ref}
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Capturez une pensée…  utilisez #tags et ! !! !!! pour la priorité"
          className="w-full resize-none bg-transparent px-4 pt-3.5 pb-2 text-sm text-zinc-100
            placeholder:text-zinc-600 outline-none leading-relaxed"
        />
        <div className="flex items-center justify-between px-3 pb-3">
          <p className="text-[10px] text-zinc-600 hidden sm:block">
            <kbd className="px-1 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] font-mono">⌘↵</kbd>
            {' '}capturer · puis convertissez vers une Zone
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim()}
            className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold
              bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-40 disabled:pointer-events-none
              transition-colors shadow-md shadow-indigo-500/25"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Capturer
          </button>
        </div>
      </div>
    </div>
  );
}

function CaptureCard({
  item,
  onEdit,
  onDelete,
  onArchive,
}: {
  item: BrainDumpItem;
  onEdit: (item: BrainDumpItem) => void;
  onDelete: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const isActive = item.status === 'raw' || item.status === 'processed';
  const pStyle = PRIORITY_STYLE[item.priority];
  const drag = useUniversalDraggable({
    payload: UniversalConverter.buildPayload('brain_dump', 'braindump', item),
    disabled: !isActive,
  });
  const swipeRef = useRef<HTMLDivElement | null>(null);
  const swipe = useSwipeAction({
    onSwipeLeft: () => {
      if (isActive) onArchive(item.id);
    },
    onSwipeRight: () => {
      /* réservé conversion rapide */
    },
    threshold: 88,
  });
  useEffect(() => {
    swipe.bind(swipeRef.current);
  }, [swipe]);

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      className={`group relative rounded-2xl border bg-white/[0.02] px-4 py-3.5
        hover:border-white/[0.12] transition-colors list-none overflow-hidden
        ${
          isActive
            ? 'border-white/[0.07]'
            : 'border-white/[0.04] opacity-70'
        }`}
    >
      {/* Swipe hint mobile */}
      <div className="absolute inset-y-0 right-0 w-16 bg-amber-500/15 flex items-center justify-center pointer-events-none md:hidden">
        <span className="text-[9px] font-semibold text-amber-300/80">Archive</span>
      </div>
      <div
        ref={swipeRef}
        className="relative bg-[var(--fm-surface-1,#0c0d12)] -mx-4 -my-3.5 px-4 py-3.5 rounded-2xl"
        {...(isActive ? swipe.handlers : {})}
      >
      <div className="flex items-start gap-3" {...drag}>
        <div className="mt-0.5 w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
          <Inbox className="w-3.5 h-3.5 text-violet-300" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-100 whitespace-pre-wrap break-words leading-relaxed">
            {item.content}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {pStyle && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${pStyle.className}`}
              >
                <Flame className="w-2.5 h-2.5" />
                {pStyle.label}
              </span>
            )}
            {item.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium
                  text-violet-300/90 bg-violet-500/10 border border-violet-500/20"
              >
                <Hash className="w-2.5 h-2.5" />
                {tag}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-600 ml-auto sm:ml-0">
              <Clock className="w-2.5 h-2.5" />
              {formatRelative(item.createdAt)}
            </span>
            {item.source === 'quick-capture' && (
              <span className="text-[10px] text-zinc-600 px-1.5 py-0.5 rounded bg-white/[0.03]">
                rapide
              </span>
            )}
            {item.status === 'converted' && (
              <span className="text-[10px] text-emerald-400/80 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                converti → {item.route}
              </span>
            )}
            {item.status === 'archived' && (
              <span className="text-[10px] text-zinc-500 px-1.5 py-0.5 rounded bg-white/[0.03]">
                archivé
              </span>
            )}
          </div>

          {isActive && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <ConvertMenu itemId={item.id} />
              <button
                type="button"
                onClick={() => onEdit(item)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-zinc-400
                  hover:text-zinc-100 hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] transition-colors"
              >
                <Pencil className="w-3 h-3" />
                Modifier
              </button>
              <button
                type="button"
                onClick={() => onArchive(item.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-zinc-400
                  hover:text-zinc-100 hover:bg-white/[0.05] border border-transparent hover:border-white/[0.06] transition-colors"
              >
                <Archive className="w-3 h-3" />
                Archiver
              </button>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-zinc-500
                  hover:text-rose-300 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-colors ml-auto"
              >
                <Trash2 className="w-3 h-3" />
                Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
      </div>
    </motion.li>
  );
}

function EditModal({
  item,
  onClose,
  onSave,
}: {
  item: BrainDumpItem;
  onClose: () => void;
  onSave: (id: string, content: string) => void;
}) {
  const [text, setText] = useState(item.content);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.setSelectionRange(text.length, text.length);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center px-4" role="dialog" aria-modal>
      <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label="Fermer" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0e1018] p-4 shadow-2xl"
      >
        <h3 className="text-sm font-semibold text-zinc-100 mb-3">Modifier la Capture Unit</h3>
        <textarea
          ref={ref}
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full resize-none rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2.5
            text-sm text-zinc-100 outline-none focus:border-indigo-500/40 leading-relaxed"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => {
              if (text.trim()) onSave(item.id, text);
            }}
            disabled={!text.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold
              bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-40"
          >
            <Check className="w-3.5 h-3.5" />
            Enregistrer
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function BrainDumpView() {
  const { captures } = useAppState();
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [editing, setEditing] = useState<BrainDumpItem | null>(null);

  const allTags = useMemo(() => {
    const map = new Map<string, number>();
    captures.forEach((c) => {
      c.tags.forEach((t) => map.set(t, (map.get(t) ?? 0) + 1));
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [captures]);

  const filtered = useMemo(() => {
    return captures.filter((c) => {
      if (statusFilter === 'active') {
        if (c.status !== 'raw' && c.status !== 'processed') return false;
      } else if (statusFilter === 'converted') {
        if (c.status !== 'converted') return false;
      } else if (statusFilter === 'archived') {
        if (c.status !== 'archived' && c.status !== 'discarded') return false;
      }

      if (tagFilter && !c.tags.includes(tagFilter)) return false;

      if (query.trim()) {
        const q = query.toLowerCase();
        const hay = `${c.content} ${c.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [captures, statusFilter, tagFilter, query]);

  const activeCount = captures.filter((c) => c.status === 'raw' || c.status === 'processed').length;

  return (
    <div className="h-full flex flex-col">
      {/* Capture input */}
      <div className="px-4 lg:px-6 pt-5 pb-4 border-b border-white/[0.04]">
        <div className="max-w-2xl mx-auto">
          <CaptureComposer
            onSubmit={(text) => CaptureService.add(text, { source: 'inbox' })}
          />

          <div className="mt-3 flex flex-wrap justify-center gap-2 text-[10px] text-zinc-600">
            <span className="inline-flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> Notes Dek
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> Unité d'Action
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> Planification
            </span>
            <span className="inline-flex items-center gap-1">
              <ArrowRight className="w-3 h-3" /> Workflow Nodal
            </span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 lg:px-6 py-3 border-b border-white/[0.04] space-y-2.5">
        <div className="max-w-2xl mx-auto flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <Search className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer l'Inbox…"
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="text-zinc-600 hover:text-zinc-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            {(
              [
                { id: 'active' as const, label: 'Actives' },
                { id: 'all' as const, label: 'Toutes' },
                { id: 'converted' as const, label: 'Converties' },
                { id: 'archived' as const, label: 'Archivées' },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  statusFilter === f.id
                    ? 'bg-indigo-500/15 text-indigo-300'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {f.label}
                {f.id === 'active' && activeCount > 0 && (
                  <span className="ml-1 tabular-nums opacity-70">{activeCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {allTags.length > 0 && (
          <div className="max-w-2xl mx-auto flex items-center gap-2 overflow-x-auto pb-0.5">
            <Filter className="w-3 h-3 text-zinc-600 shrink-0" />
            <button
              type="button"
              onClick={() => setTagFilter(null)}
              className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
                !tagFilter
                  ? 'bg-white/[0.06] text-zinc-200 border-white/[0.1]'
                  : 'text-zinc-500 border-transparent hover:border-white/[0.06]'
              }`}
            >
              Tous tags
            </button>
            {allTags.map(([tag, count]) => (
              <button
                key={tag}
                type="button"
                onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
                  tagFilter === tag
                    ? 'bg-violet-500/15 text-violet-200 border-violet-500/30'
                    : 'text-zinc-500 border-white/[0.06] hover:text-zinc-300'
                }`}
              >
                <Hash className="w-2.5 h-2.5" />
                {tag}
                <span className="opacity-60 tabular-nums">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600 flex items-center gap-2">
              <Inbox className="w-3.5 h-3.5" />
              Inbox · Capture Units
            </h3>
            <span className="text-[11px] text-zinc-600 tabular-nums">
              {filtered.length} affichée{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.015] px-6 py-12 text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto mb-4">
                <Inbox className="w-6 h-6 text-violet-400" />
              </div>
              <h2 className="text-base font-semibold text-zinc-100 mb-2">
                {captures.length === 0 ? 'Brain Dump vide' : 'Aucun résultat'}
              </h2>
              <p className="text-sm text-zinc-500 max-w-xs mx-auto leading-relaxed mb-4">
                {captures.length === 0
                  ? 'Déchargez votre esprit ici. Chaque Capture Unit pourra être convertie vers une Zone de Travail.'
                  : 'Modifiez les filtres ou tags pour afficher d\'autres Capture Units.'}
              </p>
              {captures.length === 0 && (
                <div className="inline-flex items-center gap-1.5 text-[11px] text-zinc-600">
                  Capture rapide
                  <ArrowRight className="w-3 h-3" />
                  Conversion
                  <ArrowRight className="w-3 h-3" />
                  Zones
                </div>
              )}
            </motion.div>
          ) : (
            <ul className="space-y-2.5">
              <AnimatePresence mode="popLayout" initial={false}>
                {filtered.map((c) => (
                  <CaptureCard
                    key={c.id}
                    item={c}
                    onEdit={setEditing}
                    onDelete={(id) => CaptureService.remove(id)}
                    onArchive={(id) => CaptureService.archive(id)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>

      <AnimatePresence>
        {editing && (
          <EditModal
            item={editing}
            onClose={() => setEditing(null)}
            onSave={(id, content) => {
              CaptureService.update(id, content);
              setEditing(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
