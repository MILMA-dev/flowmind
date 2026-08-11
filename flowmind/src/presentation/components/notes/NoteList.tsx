/**
 * NoteList — Panneau latéral sélection + recherche Notes Dek
 */
import {
  Archive,
  FileText,
  Hash,
  Pin,
  Plus,
  Search,
  X,
} from 'lucide-react';
import type { Note } from '../../../core/Types';
import { UniversalConverter } from '../../../core/UniversalConverter';
import { useUniversalDraggable } from '../../../hooks/useUniversalDraggable';

function preview(content: string, max = 80): string {
  const plain = content
    .replace(/#{1,6}\s/g, '')
    .replace(/[*_`>\[\]()!-]/g, '')
    .replace(/\n+/g, ' ')
    .trim();
  if (!plain) return 'Note vide';
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}

function relDate(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "à l'instant";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
}

interface Props {
  notes: Note[];
  activeId: string | null;
  query: string;
  tagFilter: string | null;
  showArchived: boolean;
  tags: { tag: string; count: number }[];
  onQuery: (q: string) => void;
  onTagFilter: (tag: string | null) => void;
  onToggleArchived: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
}

export default function NoteList({
  notes,
  activeId,
  query,
  tagFilter,
  showArchived,
  tags,
  onQuery,
  onTagFilter,
  onToggleArchived,
  onSelect,
  onCreate,
}: Props) {
  return (
    <aside className="flex flex-col h-full min-h-0 w-full md:w-72 lg:w-80 shrink-0 border-r border-white/[0.06] bg-[#0a0b10]/80">
      <div className="p-3 border-b border-white/[0.05] space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <Search className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
            <input
              type="search"
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Rechercher…"
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none min-w-0"
            />
            {query && (
              <button type="button" onClick={() => onQuery('')} className="text-zinc-600 hover:text-zinc-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onCreate}
            className="p-2 rounded-xl bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 hover:bg-indigo-500/25 transition-colors"
            title="Nouvelle note"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          <button
            type="button"
            onClick={onToggleArchived}
            className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
              showArchived
                ? 'bg-amber-500/15 text-amber-200 border-amber-500/25'
                : 'text-zinc-500 border-white/[0.06] hover:text-zinc-300'
            }`}
          >
            <Archive className="w-3 h-3" />
            Archives
          </button>
          {tags.slice(0, 8).map(({ tag, count }) => (
            <button
              key={tag}
              type="button"
              onClick={() => onTagFilter(tagFilter === tag ? null : tag)}
              className={`shrink-0 inline-flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors ${
                tagFilter === tag
                  ? 'bg-violet-500/15 text-violet-200 border-violet-500/30'
                  : 'text-zinc-500 border-white/[0.06] hover:text-zinc-300'
              }`}
            >
              <Hash className="w-2.5 h-2.5" />
              {tag}
              <span className="opacity-50">{count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {notes.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <FileText className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
            <p className="text-xs text-zinc-600">Aucune note</p>
          </div>
        ) : (
          notes.map((n) => (
            <NoteListItem
              key={n.id}
              note={n}
              active={n.id === activeId}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function NoteListItem({
  note,
  active,
  onSelect,
}: {
  note: Note;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const drag = useUniversalDraggable({
    payload: UniversalConverter.buildPayload('note', 'notes', note),
  });

  return (
              <button
                type="button"
                onClick={() => onSelect(note.id)}
                {...drag}
                className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors border ${
                  active
                    ? 'bg-indigo-500/12 border-indigo-500/25'
                    : 'border-transparent hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {note.pinned && (
                        <Pin className="w-3 h-3 text-amber-400 shrink-0" />
                      )}
                      <p
                        className={`text-sm font-medium truncate ${
                          active ? 'text-zinc-50' : 'text-zinc-200'
                        }`}
                      >
                        {note.title || 'Sans titre'}
                      </p>
                    </div>
                    <p className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5 leading-relaxed">
                      {preview(note.content)}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-zinc-600">{relDate(note.updatedAt)}</span>
                      {note.tags.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="text-[9px] px-1.5 py-0.5 rounded-md bg-violet-500/10 text-violet-300/80"
                        >
                          #{t}
                        </span>
                      ))}
                      {note.isArchived && (
                        <span className="text-[9px] text-amber-500/80">archivé</span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
  );
}
