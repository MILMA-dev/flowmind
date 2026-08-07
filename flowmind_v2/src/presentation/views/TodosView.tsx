/**
 * Zone 3 — Listes d'Unités d'Action (multi-projets)
 * Terminologie FlowMind : pas de "Todo List classique"
 * Équipe MILMA Entreprise
 */
import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Filter, ListChecks, Plus, Search, X } from 'lucide-react';
import { useAppState } from '../../hooks/useStateStore';
import { TodoManager, listProgress } from '../../core/TodoManager';
import TodoCard from '../components/todos/TodoCard';

export default function TodosView() {
  const { todoLists, tasks } = useAppState();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(false);

  useEffect(() => {
    TodoManager.seedIfEmpty();
  }, []);

  const categories = useMemo(() => TodoManager.categories(), [todoLists]);

  const lists = useMemo(
    () =>
      TodoManager.filterLists({
        category,
        query,
        hideCompletedLists: hideDone,
      }),
    [todoLists, category, query, hideDone]
  );

  const globalProgress = useMemo(() => {
    const all = todoLists.flatMap((l) => l.items);
    if (!all.length) return 0;
    return Math.round(
      (all.filter((i) => i.isCompleted).length / all.length) * 100
    );
  }, [todoLists]);

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 lg:px-6 py-3 border-b border-white/[0.04]">
        <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] min-w-0">
          <Search className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer listes et unités…"
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none min-w-0"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="text-zinc-600 hover:text-zinc-300">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 overflow-x-auto max-w-full">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                !category
                  ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25'
                  : 'text-zinc-500 border-white/[0.06] hover:text-zinc-300'
              }`}
            >
              Toutes
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(category === c ? null : c)}
                className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                  category === c
                    ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25'
                    : 'text-zinc-500 border-white/[0.06] hover:text-zinc-300'
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setHideDone((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
              hideDone
                ? 'bg-white/[0.06] text-zinc-200 border-white/[0.1]'
                : 'text-zinc-500 border-white/[0.06]'
            }`}
          >
            <Filter className="w-3 h-3" />
            Actives
          </button>

          <button
            type="button"
            onClick={() =>
              TodoManager.createList({
                title: 'Nouvelle liste',
                category: category || 'Général',
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
              bg-indigo-500/15 text-indigo-300 border border-indigo-500/25
              hover:bg-indigo-500/25 transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Liste
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 px-4 lg:px-6 py-2 border-b border-white/[0.03] text-[10px] text-zinc-600">
        <span className="tabular-nums">{todoLists.length} listes</span>
        <span className="opacity-40">·</span>
        <span className="tabular-nums">
          {todoLists.reduce((a, l) => a + l.items.length, 0)} unités
        </span>
        <span className="opacity-40">·</span>
        <span className="text-indigo-300/80 font-medium tabular-nums">
          {globalProgress}% global
        </span>
        {tasks.length > 0 && (
          <>
            <span className="opacity-40">·</span>
            <span className="tabular-nums">{tasks.length} issues du Capture</span>
          </>
        )}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        {lists.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="h-full min-h-[280px] flex flex-col items-center justify-center text-center px-6"
          >
            <div className="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center mb-5">
              <ListChecks className="w-7 h-7 text-sky-400" />
            </div>
            <h2 className="text-lg font-semibold text-zinc-100 mb-2">
              Listes d'Unités d'Action
            </h2>
            <p className="text-sm text-zinc-500 max-w-sm leading-relaxed mb-6">
              Organisez vos actions par projets et catégories. Progression dynamique,
              échéances et priorités — indépendant des Workflows Nodaux.
            </p>
            <button
              type="button"
              onClick={() => {
                if (TodoManager.getLists().length === 0) TodoManager.seedIfEmpty();
                else TodoManager.createList();
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold
                bg-indigo-500 text-white hover:bg-indigo-400 shadow-lg shadow-indigo-500/25"
            >
              <Plus className="w-4 h-4" />
              Créer une liste
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {lists.map((list) => (
              <TodoCard key={list.id} list={list} />
            ))}

            {/* Carte ajout rapide */}
            <button
              type="button"
              onClick={() =>
                TodoManager.createList({
                  title: 'Nouvelle liste',
                  category: category || 'Général',
                })
              }
              className="min-h-[200px] rounded-2xl border border-dashed border-white/[0.1]
                bg-white/[0.01] hover:bg-white/[0.03] hover:border-indigo-500/30
                flex flex-col items-center justify-center gap-2 text-zinc-500 hover:text-indigo-300 transition-colors"
            >
              <Plus className="w-6 h-6" />
              <span className="text-sm font-medium">Nouvelle liste</span>
              {lists[0] && (
                <span className="text-[10px] text-zinc-600">
                  Moyenne {Math.round(
                    lists.reduce((a, l) => a + listProgress(l), 0) / lists.length
                  )}
                  % sur les listes visibles
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
