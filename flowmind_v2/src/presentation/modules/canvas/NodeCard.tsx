/**
 * NodeCard — Nœud canvas + machine à états d'exécution
 * Ancres Input / Output · badge état · actions run
 */
import {
  Zap,
  Play,
  RefreshCw,
  Target,
  GitFork,
  Circle,
  StickyNote,
  Trash2,
} from 'lucide-react';
import {
  EXECUTION_STATE_META,
  NODE_HEIGHT,
  NODE_TYPE_META,
  NODE_WIDTH,
  type NodeType,
  type WorkflowNode,
} from '../../../core/Types';
import {
  ExecutionBadge,
  NodeRunButton,
  getExecutionState,
  nodeStateClass,
} from './NodeRenderer';

const ICONS: Record<NodeType, React.ReactNode> = {
  trigger: <Zap className="w-3.5 h-3.5" strokeWidth={2} />,
  action: <Play className="w-3.5 h-3.5" strokeWidth={2} />,
  routine: <RefreshCw className="w-3.5 h-3.5" strokeWidth={2} />,
  goal: <Target className="w-3.5 h-3.5" strokeWidth={2} />,
  condition: <GitFork className="w-3.5 h-3.5" strokeWidth={2} />,
  output: <Circle className="w-3.5 h-3.5" strokeWidth={2} />,
  note: <StickyNote className="w-3.5 h-3.5" strokeWidth={2} />,
};

const PRIORITY_DOT: Record<string, string> = {
  low: '#71717a',
  medium: '#38bdf8',
  high: '#fb923c',
  critical: '#f43f5e',
};

interface Props {
  node: WorkflowNode;
  selected: boolean;
  livePos?: { x: number; y: number };
  dimmed?: boolean;
  onPointerDownBody: (e: React.PointerEvent, nodeId: string) => void;
  onPointerDownOutput: (e: React.PointerEvent, nodeId: string) => void;
  onPointerUpInput: (e: React.PointerEvent, nodeId: string) => void;
  onSelect: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onLabelChange: (nodeId: string, label: string) => void;
  onStart?: (nodeId: string) => void;
  onComplete?: (nodeId: string) => void;
}

export default function NodeCard({
  node,
  selected,
  livePos,
  dimmed,
  onPointerDownBody,
  onPointerDownOutput,
  onPointerUpInput,
  onSelect,
  onDelete,
  onLabelChange,
  onStart,
  onComplete,
}: Props) {
  const meta = NODE_TYPE_META[node.type] ?? NODE_TYPE_META.action;
  const exec = getExecutionState(node);
  const execMeta = EXECUTION_STATE_META[exec];
  const x = livePos?.x ?? node.x;
  const y = livePos?.y ?? node.y;
  const subCount = node.subtasks?.length ?? 0;
  const progress = node.progress ?? 0;
  const hasRecurrence =
    node.recurrence?.enabled && node.recurrence.frequency !== 'none';
  const locked = exec === 'locked';

  return (
    <div
      className={`fm-node absolute select-none touch-none ${nodeStateClass(exec)} ${
        selected ? 'fm-node--selected' : ''
      } ${dimmed ? 'opacity-35' : ''} ${locked ? 'fm-node--locked' : ''}`}
      style={{
        left: x,
        top: y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        zIndex: selected ? 20 : 10,
      }}
      data-node-id={node.id}
      data-exec={exec}
      onPointerDown={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest('[data-anchor]')) return;
        if (t.closest('.fm-node-run')) return;
        onSelect(node.id);
        onPointerDownBody(e, node.id);
      }}
    >
      <div
        className="fm-node__body h-full rounded-xl border backdrop-blur-sm shadow-xl shadow-black/30 flex flex-col overflow-hidden"
        style={{
          borderColor: selected ? execMeta.color : `${execMeta.color}55`,
          background: `linear-gradient(145deg, ${execMeta.bg}, rgba(12,13,18,0.94))`,
          boxShadow: selected
            ? `0 0 0 1px ${execMeta.ring}, 0 12px 40px -12px ${execMeta.ring}`
            : exec === 'in_progress'
              ? `0 0 20px -4px ${execMeta.ring}`
              : undefined,
        }}
      >
        <div className="flex items-center gap-2 px-2.5 pt-2 pb-0.5 flex-1 min-h-0">
          <span
            className="flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
            style={{
              background: meta.bg,
              color: meta.color,
              border: `1px solid ${meta.ring}`,
              opacity: locked ? 0.55 : 1,
            }}
          >
            {ICONS[node.type]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <p
                className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-70 truncate"
                style={{ color: meta.color }}
              >
                {meta.label}
              </p>
              {node.priority && node.priority !== 'medium' && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: PRIORITY_DOT[node.priority] }}
                />
              )}
              {hasRecurrence && (
                <RefreshCw className="w-2.5 h-2.5 text-cyan-400/80 shrink-0" strokeWidth={2.5} />
              )}
            </div>
            {selected ? (
              <input
                className="w-full bg-transparent text-[12px] font-medium text-zinc-100 outline-none border-b border-white/10 py-0.5"
                value={node.label}
                onChange={(e) => onLabelChange(node.id, e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <p className="text-[12px] font-medium text-zinc-100 truncate leading-tight">
                {node.label}
              </p>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            {onStart && onComplete && (
              <NodeRunButton
                state={exec}
                onStart={() => onStart(node.id)}
                onComplete={() => onComplete(node.id)}
              />
            )}
            {selected && (
              <button
                type="button"
                className="p-1 rounded-md text-zinc-500 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(node.id);
                }}
                title="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="px-2.5 pb-1.5 flex items-center gap-1.5">
          <ExecutionBadge state={exec} compact />
          {subCount > 0 && (
            <div className="flex-1 min-w-0">
              <div className="h-1 rounded-full bg-black/30 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress}%`,
                    background: execMeta.color,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        type="button"
        data-anchor="input"
        data-node-id={node.id}
        className="fm-anchor fm-anchor--input"
        style={{ borderColor: execMeta.color }}
        title="Input"
        onPointerUp={(e) => onPointerUpInput(e, node.id)}
        onPointerDown={(e) => e.stopPropagation()}
      />

      <button
        type="button"
        data-anchor="output"
        data-node-id={node.id}
        className="fm-anchor fm-anchor--output"
        style={{ borderColor: execMeta.color, backgroundColor: execMeta.color }}
        title="Output — glisser pour connecter"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onPointerDownOutput(e, node.id);
        }}
      />
    </div>
  );
}
