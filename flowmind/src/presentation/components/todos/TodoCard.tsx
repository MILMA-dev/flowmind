/**
 * TodoCard — Carte Liste d'Unités d'Action + progression
 */
import { useState } from 'react';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import type { TodoList } from '../../../core/Types';
import { TodoManager, listStats } from '../../../core/TodoManager';
import TodoItemRow from './TodoItemRow';
import { UniversalConverter } from '../../../core/UniversalConverter';
import { useUniversalDraggable } from '../../../hooks/useUniversalDraggable';

interface Props {
  list: TodoList;
}

export default function TodoCard({ list }: Props) {
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState(false);
  const stats = listStats(list);
  const drag = useUniversalDraggable({
    payload: UniversalConverter.buildPayload('todo_list', 'todos', list),
  });

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    TodoManager.addItem(list.id, { text: t });
    setDraft('');
  };

  return (
    <article
      className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden min-h-[280px] max-h-[480px]"
    >
      {/* Header */}
      <header className="px-4 pt-3.5 pb-2 border-b border-white/[0.05]" {...drag}>
        <div className="flex items-start gap-2">
          <span
            className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ring-2 ring-white/5"
            style={{ backgroundColor: list.color }}
          />
          <div className="min-w-0 flex-1">
            <input
              value={list.title}
              onChange={(e) => TodoManager.renameList(list.id, e.target.value)}
              className="w-full bg-transparent text-sm font-semibold text-zinc-100 outline-none"
            />
            <input
              value={list.category}
              onChange={(e) => TodoManager.setCategory(list.id, e.target.value)}
              className="w-full bg-transparent text-[10px] text-zinc-500 outline-none mt-0.5 uppercase tracking-wider font-medium"
            />
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              className="p-1 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menu && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10"
                  aria-label="Fermer"
                  onClick={() => setMenu(false)}
                />
                <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-lg border border-white/[0.1] bg-[#12141c] shadow-xl py-1">
                  <button
                    type="button"
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/10"
                    onClick={() => {
                      setMenu(false);
                      if (confirm('Supprimer cette liste d\'actions ?')) {
                        TodoManager.deleteList(list.id);
                      }
                    }}
                  >
                    <Trash2 className="w-3 h-3" /> Supprimer
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10px] mb-1">
            <span className="text-zinc-500 tabular-nums">
              {stats.done}/{stats.total} unités
            </span>
            <span className="font-semibold tabular-nums" style={{ color: list.color }}>
              {stats.progress}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${stats.progress}%`,
                background: `linear-gradient(90deg, ${list.color}, ${list.color}99)`,
              }}
            />
          </div>
          {stats.overdue > 0 && (
            <p className="mt-1 text-[10px] text-rose-400/90">
              {stats.overdue} en retard
            </p>
          )}
        </div>
      </header>

      {/* Items */}
      <ul className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {list.items.length === 0 && (
          <li className="text-[11px] text-zinc-600 text-center py-6 px-3">
            Aucune unité — ajoutez une action ci-dessous
          </li>
        )}
        {list.items.map((item) => (
          <TodoItemRow
            key={item.id}
            item={item}
            onToggle={() => TodoManager.toggleItem(list.id, item.id)}
            onChangeText={(text) =>
              TodoManager.updateItem(list.id, item.id, { text })
            }
            onChangePriority={(priority) =>
              TodoManager.updateItem(list.id, item.id, { priority })
            }
            onChangeDue={(dueDate) =>
              TodoManager.updateItem(list.id, item.id, { dueDate })
            }
            onRemove={() => TodoManager.removeItem(list.id, item.id)}
          />
        ))}
      </ul>

      {/* Quick add */}
      <div className="p-2 border-t border-white/[0.05] flex items-center gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Ajouter une unité…"
          className="flex-1 px-2.5 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-indigo-500/35"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="p-2 rounded-xl text-indigo-300 bg-indigo-500/15 border border-indigo-500/25
            hover:bg-indigo-500/25 disabled:opacity-40 disabled:pointer-events-none transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </article>
  );
}
