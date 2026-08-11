/**
 * NoteEditor — Éditeur Focus sans distraction (Markdown léger)
 * Auto-save via NoteManager debounce
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Bold,
  Check,
  Eye,
  Hash,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Maximize2,
  Minimize2,
  Pin,
  Trash2,
  Type,
} from 'lucide-react';
import type { Note } from '../../../core/Types';
import { NoteManager } from '../../../core/NoteManager';

/** Rendu Markdown minimal (titres, gras, italique, listes, code) */
function renderMarkdown(src: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

  const lines = src.split('\n');
  const html: string[] = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      html.push('</ol>');
      inOl = false;
    }
  };

  const inline = (t: string) =>
    escape(t)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="fm-md-code">$1</code>')
      .replace(
        /\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g,
        (_, label, url) => {
          const cleanUrl = url
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/`/g, '&#x60;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer" class="text-indigo-400 underline">${label}</a>`;
        }
      );

  for (const line of lines) {
    if (/^###\s+/.test(line)) {
      closeLists();
      html.push(`<h3 class="fm-md-h3">${inline(line.replace(/^###\s+/, ''))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(line)) {
      closeLists();
      html.push(`<h2 class="fm-md-h2">${inline(line.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }
    if (/^#\s+/.test(line)) {
      closeLists();
      html.push(`<h1 class="fm-md-h1">${inline(line.replace(/^#\s+/, ''))}</h1>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (inOl) {
        html.push('</ol>');
        inOl = false;
      }
      if (!inUl) {
        html.push('<ul class="fm-md-ul">');
        inUl = true;
      }
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (inUl) {
        html.push('</ul>');
        inUl = false;
      }
      if (!inOl) {
        html.push('<ol class="fm-md-ol">');
        inOl = true;
      }
      html.push(`<li>${inline(line.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }
    if (!line.trim()) {
      closeLists();
      html.push('<div class="h-2"></div>');
      continue;
    }
    closeLists();
    html.push(`<p class="fm-md-p">${inline(line)}</p>`);
  }
  closeLists();
  return html.join('');
}

interface Props {
  note: Note;
  focusMode: boolean;
  onToggleFocus: () => void;
  onDelete: () => void;
}

export default function NoteEditor({
  note,
  focusMode,
  onToggleFocus,
  onDelete,
}: Props) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [tagInput, setTagInput] = useState(note.tags.join(', '));
  const [preview, setPreview] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const noteId = note.id;

  // Sync quand on change de note
  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    setTagInput(note.tags.join(', '));
    setPreview(false);
  }, [noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flash autosave
  useEffect(() => {
    setSavedFlash(true);
    const t = window.setTimeout(() => setSavedFlash(false), 800);
    return () => clearTimeout(t);
  }, [note.updatedAt]);

  const html = useMemo(() => renderMarkdown(content), [content]);

  const applyWrap = (before: string, after = before) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = content.slice(start, end) || 'texte';
    const next =
      content.slice(0, start) + before + selected + after + content.slice(end);
    setContent(next);
    NoteManager.updateDebounced(noteId, { content: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const applyLinePrefix = (prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = content.lastIndexOf('\n', start - 1) + 1;
    const next = content.slice(0, lineStart) + prefix + content.slice(lineStart);
    setContent(next);
    NoteManager.updateDebounced(noteId, { content: next });
  };

  return (
    <div
      className={`flex flex-col h-full min-h-0 ${
        focusMode ? 'bg-[#07080c]' : 'bg-transparent'
      }`}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 px-3 lg:px-5 py-2 border-b border-white/[0.05]">
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-white/[0.02] border border-white/[0.06]">
          <ToolbarBtn title="Gras" onClick={() => applyWrap('**')}>
            <Bold className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn title="Italique" onClick={() => applyWrap('*')}>
            <Italic className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn title="Titre" onClick={() => applyLinePrefix('## ')}>
            <Heading2 className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn title="Liste" onClick={() => applyLinePrefix('- ')}>
            <List className="w-3.5 h-3.5" />
          </ToolbarBtn>
          <ToolbarBtn title="Liste numérotée" onClick={() => applyLinePrefix('1. ')}>
            <ListOrdered className="w-3.5 h-3.5" />
          </ToolbarBtn>
        </div>

        <button
          type="button"
          onClick={() => setPreview((v) => !v)}
          className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
            preview
              ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25'
              : 'text-zinc-500 border-white/[0.06] hover:text-zinc-300'
          }`}
        >
          {preview ? <Type className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {preview ? 'Éditer' : 'Aperçu'}
        </button>

        <div className="flex items-center gap-1 ml-auto">
          {savedFlash && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-emerald-400/80 mr-1">
              <Check className="w-3 h-3" /> Enregistré
            </span>
          )}
          <button
            type="button"
            onClick={() => NoteManager.togglePin(noteId)}
            className={`p-1.5 rounded-lg border transition-colors ${
              note.pinned
                ? 'text-amber-300 bg-amber-500/10 border-amber-500/25'
                : 'text-zinc-500 border-transparent hover:bg-white/[0.04]'
            }`}
            title="Épingler"
          >
            <Pin className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => NoteManager.toggleArchive(noteId)}
            className={`p-1.5 rounded-lg border transition-colors ${
              note.isArchived
                ? 'text-amber-300 bg-amber-500/10 border-amber-500/25'
                : 'text-zinc-500 border-transparent hover:bg-white/[0.04]'
            }`}
            title="Archiver"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleFocus}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors"
            title={focusMode ? 'Quitter le focus' : 'Mode focus'}
          >
            {focusMode ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
            title="Supprimer"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div
        className={`flex-1 min-h-0 overflow-y-auto ${
          focusMode ? 'px-4 sm:px-10 lg:px-24 py-8' : 'px-4 lg:px-8 py-5'
        }`}
      >
        <div className={`mx-auto ${focusMode ? 'max-w-2xl' : 'max-w-3xl'}`}>
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              NoteManager.updateDebounced(noteId, { title: e.target.value });
            }}
            placeholder="Titre de la note"
            className="w-full bg-transparent text-2xl lg:text-3xl font-semibold text-zinc-50 outline-none placeholder:text-zinc-700 mb-3 tracking-tight"
          />

          <div className="flex items-center gap-2 mb-5">
            <Hash className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onBlur={() => {
                const tags = tagInput
                  .split(/[, ]+/)
                  .map((t) => t.replace(/^#/, '').trim())
                  .filter(Boolean);
                NoteManager.setTags(noteId, tags);
              }}
              placeholder="tags, séparés, par, virgules"
              className="flex-1 bg-transparent text-xs text-violet-300/90 placeholder:text-zinc-600 outline-none"
            />
          </div>

          {preview ? (
            <div
              className="fm-md-preview prose-invert min-h-[240px] text-sm text-zinc-300 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: html || '<p class="text-zinc-600">Aperçu vide</p>' }}
            />
          ) : (
            <textarea
              ref={taRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                NoteManager.updateDebounced(noteId, { content: e.target.value });
              }}
              placeholder="Écrivez en Markdown… **gras** *italique* ## titre - liste"
              className="w-full min-h-[min(60vh,520px)] resize-none bg-transparent text-[15px] text-zinc-200 leading-7 outline-none placeholder:text-zinc-700 font-[inherit]"
              spellCheck
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] transition-colors"
    >
      {children}
    </button>
  );
}
