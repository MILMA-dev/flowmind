/**
 * TodoItemRow — Ligne d'Unité d'Action interactive
 */
import { useState } from 'react';
import { Calendar, Check, Flag, Trash2 } from 'lucide-react';
import type { TodoItem } from '../../../core/Types';
import { UniversalConverter } from '../../../core/UniversalConverter';
import { useUniversalDraggable } from '../../../hooks/useUniversalDraggable';

const PRIORITY_STYLE = {
  low: 'text-zinc-500',
  medium: 'text-sky-400',
  high: 'text-orange-400',
} as const;

interface Props {
  item: TodoItem;
  onToggle: () => void;
  onChangeText: (text: string) => void;
  onChangePriority: (p: TodoItem['priority']) => void;
  onChangeDue: (iso: string | null) => void;
  onRemove: () => void;
}

export default function TodoItemRow({
  item,
  onToggle,
  onChangeText,
  onChangePriority,
  onChangeDue,
  onRemove,
}: Props) {
  const [editing, setEditing] = useState(false);
  const overdue =
    !item.isCompleted &&
    item.dueDate &&
    new Date(item.dueDate).getTime() < Date.now();
  const drag = useUniversalDraggable({
    payload: UniversalConverter.buildPayload('todo_item', 'todos', item),
  });

  return (
    <li
      {...drag}
      className={`group flex items-start gap-2 rounded-xl border px-2 py-1.5 transition-colors ${
        item.isCompleted
          ? 'border-white/[0.04] bg-white/[0.015] opacity-70'
          : 'border-white/[0.06] bg-white/[0.025] hover:border-white/[0.1]'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
          item.isCompleted
            ? 'bg-emerald-500 border-emerald-400 text-white'
            : 'border-white/20 hover:border-emerald-400/50'
        }`}
        aria-label={item.isCompleted ? 'Décocher' : 'Cocher'}
      >
        {item.isCompleted && <Check className="w-3 h-3" strokeWidth={3} />}
      </button>

      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            autoFocus
            value={item.text}
            onChange={(e) => onChangeText(e.target.value)}
            onBlur={() => setEditing(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setEditing(false);
            }}
            className="w-full bg-transparent text-sm text-zinc-100 outline-none border-b border-white/10 py-0.5"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`w-full text-left text-sm leading-snug ${
              item.isCompleted ? 'text-zinc-500 line-through' : 'text-zinc-200'
            }`}
          >
            {item.text}
          </button>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const order: TodoItem['priority'][] = ['low', 'medium', 'high'];
              const i = order.indexOf(item.priority);
              onChangePriority(order[(i + 1) % order.length]);
            }}
            className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${PRIORITY_STYLE[item.priority]}`}
            title="Priorité"
          >
            <Flag className="w-2.5 h-2.5" />
            {item.priority}
          </button>

          <label
            className={`inline-flex items-center gap-0.5 text-[10px] cursor-pointer ${
              overdue ? 'text-rose-400' : 'text-zinc-600 hover:text-zinc-400'
            }`}
          >
            <Calendar className="w-2.5 h-2.5" />
            <input
              type="date"
              value={item.dueDate ? item.dueDate.slice(0, 10) : ''}
              onChange={(e) =>
                onChangeDue(
                  e.target.value
                    ? new Date(e.target.value + 'T12:00:00').toISOString()
                    : null
                )
              }
              className="bg-transparent outline-none max-w-[7.5rem] text-[10px]"
            />
          </label>
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="p-1 rounded-md text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-rose-300 hover:bg-rose-500/10 transition-all"
        aria-label="Supprimer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}
