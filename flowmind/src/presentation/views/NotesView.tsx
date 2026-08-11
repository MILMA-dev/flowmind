/**
 * Zone 2 — Notes Dek
 * Master-Detail + mode Focus plein écran
 * Équipe MILMA Entreprise
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Plus } from 'lucide-react';
import { useAppState } from '../../hooks/useStateStore';
import { NoteManager } from '../../core/NoteManager';
import { StateStore } from '../../core/StateStore';
import NoteList from '../components/notes/NoteList';
import NoteEditor from '../components/notes/NoteEditor';

export default function NotesView() {
  const { notes, ui } = useAppState();
  const [query, setQuery] = useState('');
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const focusMode = ui.notesFocusMode;
  const activeId = ui.activeNoteId;

  const filtered = useMemo(
    () => NoteManager.searchNotes(query, tagFilter, { archived: showArchived }),
    [notes, query, tagFilter, showArchived]
  );

  const tags = useMemo(() => NoteManager.allTags(), [notes]);

  const activeNote = useMemo(() => {
    if (!activeId) return null;
    return notes.find((n) => n.id === activeId) ?? null;
  }, [notes, activeId]);

  // Sélection auto première note
  useEffect(() => {
    if (activeId && notes.some((n) => n.id === activeId)) return;
    const first = NoteManager.searchNotes('', null, { archived: false })[0];
    if (first) StateStore.setActiveNoteId(first.id);
  }, [notes, activeId]);

  // Échap quitte le focus
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') StateStore.setNotesFocusMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode]);

  const create = () => {
    const n = NoteManager.create({ title: 'Nouvelle note' });
    StateStore.setActiveNoteId(n.id);
  };

  if (focusMode && activeNote) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-[#07080c]">
        <NoteEditor
          note={activeNote}
          focusMode
          onToggleFocus={() => StateStore.setNotesFocusMode(false)}
          onDelete={() => {
            if (confirm('Supprimer cette note ?')) {
              NoteManager.deleteNote(activeNote.id);
              StateStore.setNotesFocusMode(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col md:flex-row">
      {/* Liste — masquée en mobile si note ouverte : on garde toujours accessible */}
      <div className={`${activeNote ? 'hidden md:flex' : 'flex'} h-full min-h-0 md:contents`}>
        <NoteList
          notes={filtered}
          activeId={activeId}
          query={query}
          tagFilter={tagFilter}
          showArchived={showArchived}
          tags={tags}
          onQuery={setQuery}
          onTagFilter={setTagFilter}
          onToggleArchived={() => setShowArchived((v) => !v)}
          onSelect={(id) => StateStore.setActiveNoteId(id)}
          onCreate={create}
        />
      </div>

      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {activeNote ? (
          <>
            {/* Mobile back */}
            <div className="md:hidden flex items-center gap-2 px-3 py-2 border-b border-white/[0.05]">
              <button
                type="button"
                onClick={() => StateStore.setActiveNoteId(null)}
                className="text-xs text-indigo-300 font-medium"
              >
                ← Liste
              </button>
              <span className="text-xs text-zinc-500 truncate">{activeNote.title}</span>
            </div>
            <NoteEditor
              note={activeNote}
              focusMode={false}
              onToggleFocus={() => StateStore.setNotesFocusMode(true)}
              onDelete={() => {
                if (confirm('Supprimer cette note ?')) {
                  NoteManager.deleteNote(activeNote.id);
                }
              }}
            />
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex-1 flex flex-col items-center justify-center text-center px-6"
          >
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-5">
              <FileText className="w-7 h-7 text-cyan-400" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">Notes Dek</h2>
            <p className="text-sm text-zinc-500 max-w-sm leading-relaxed mb-5">
              Éditeur sans distraction, auto-save, tags et recherche full-text.
              Markdown léger pour structurer vos idées.
            </p>
            <button
              type="button"
              onClick={create}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                bg-indigo-500 text-white hover:bg-indigo-400 shadow-lg shadow-indigo-500/25"
            >
              <Plus className="w-4 h-4" />
              Créer une note
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
