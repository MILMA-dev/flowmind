/**
 * NodeRenderer — Badges d'état d'exécution + helpers visuels
 * Équipe MILMA
 */
import {
  Lock,
  CircleDot,
  Loader2,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Play,
} from 'lucide-react';
import {
  EXECUTION_STATE_META,
  type ExecutionState,
  type WorkflowNode,
} from '../../../core/Types';

const ICONS: Record<ExecutionState, React.ReactNode> = {
  locked: <Lock className="w-3 h-3" strokeWidth={2.5} />,
  ready: <CircleDot className="w-3 h-3" strokeWidth={2.5} />,
  in_progress: <Loader2 className="w-3 h-3 animate-spin" strokeWidth={2.5} />,
  completed: <CheckCircle2 className="w-3 h-3" strokeWidth={2.5} />,
  failed: <XCircle className="w-3 h-3" strokeWidth={2.5} />,
  skipped: <MinusCircle className="w-3 h-3" strokeWidth={2.5} />,
};

export function getExecutionState(node: WorkflowNode): ExecutionState {
  return node.executionState ?? (node.status as ExecutionState) ?? 'locked';
}

export function ExecutionBadge({
  state,
  compact,
}: {
  state: ExecutionState;
  compact?: boolean;
}) {
  const meta = EXECUTION_STATE_META[state] ?? EXECUTION_STATE_META.locked;
  return (
    <span
      className={`fm-exec-badge inline-flex items-center gap-1 rounded-md border font-semibold uppercase tracking-wide ${
        compact ? 'text-[8px] px-1 py-0.5' : 'text-[9px] px-1.5 py-0.5'
      }`}
      style={{
        color: meta.color,
        background: meta.bg,
        borderColor: meta.ring,
      }}
      title={meta.label}
    >
      {ICONS[state]}
      {!compact && <span>{meta.label}</span>}
    </span>
  );
}

export function NodeRunButton({
  state,
  onStart,
  onComplete,
  disabled,
}: {
  state: ExecutionState;
  onStart: () => void;
  onComplete: () => void;
  disabled?: boolean;
}) {
  if (state === 'ready') {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onStart();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="fm-node-run p-1 rounded-md text-sky-300 bg-sky-500/15 border border-sky-500/30
          hover:bg-sky-500/25 transition-colors disabled:opacity-40"
        title="Démarrer"
      >
        <Play className="w-3 h-3" fill="currentColor" />
      </button>
    );
  }
  if (state === 'in_progress') {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onComplete();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className="fm-node-run p-1 rounded-md text-emerald-300 bg-emerald-500/15 border border-emerald-500/30
          hover:bg-emerald-500/25 transition-colors"
        title="Terminer"
      >
        <CheckCircle2 className="w-3 h-3" />
      </button>
    );
  }
  return null;
}

/** Classes CSS d'état pour la carte nœud */
export function nodeStateClass(state: ExecutionState): string {
  return `fm-node-state fm-node-state--${state}`;
}

export function edgeStrokeForStates(
  sourceState: ExecutionState | undefined,
  hot: boolean
): string {
  if (hot) return 'rgba(248,113,113,0.9)';
  if (sourceState === 'completed' || sourceState === 'skipped') {
    return 'rgba(52,211,153,0.75)';
  }
  if (sourceState === 'in_progress') return 'rgba(251,146,60,0.8)';
  if (sourceState === 'failed') return 'rgba(244,63,94,0.7)';
  if (sourceState === 'ready') return 'rgba(56,189,248,0.55)';
  return 'url(#fm-edge-grad)';
}
