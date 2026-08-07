/**
 * WorkflowCanvas — Moteur SVG/HTML hybride
 * Pan, Zoom, Drag nœuds, Connexions Bézier
 * Émet des événements ; ne mute pas le store directement (via WorkflowEngine)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { WorkflowEngine } from '../../../core/WorkflowEngine';
import { ExecutionEngine } from '../../../core/ExecutionEngine';
import { StateStore } from '../../../core/StateStore';
import { EventBus } from '../../../core/EventBus';
import { useAppState } from '../../../hooks/useStateStore';
import {
  AppEvents,
  NODE_HEIGHT,
  NODE_WIDTH,
  type CanvasViewport,
  type FlowPulse,
  type Workflow,
  type WorkflowNode,
} from '../../../core/Types';
import {
  DEFAULT_VIEWPORT,
  clampZoom,
  gridBackground,
  screenToWorld,
  viewportTransform,
  zoomAtPoint,
  ZOOM_STEP,
  type ConnectSession,
  type DragNodeSession,
  type PanSession,
} from './CanvasController';
import {
  PULSE_COLORS,
  bezierPoint,
  buildBezierPath,
  getOutputAnchor,
  renderConnections,
  renderDraftConnection,
} from './ConnectionRenderer';
import { edgeStrokeForStates, getExecutionState } from './NodeRenderer';
import NodeCard from './NodeCard';

interface Props {
  workflow: Workflow;
  /** Viewport contrôlé par le parent (toolbar zoom) */
  viewport?: CanvasViewport;
  onViewportChange?: (vp: CanvasViewport) => void;
}

export default function WorkflowCanvas({ workflow, viewport, onViewportChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appState = useAppState();
  const selectedId = appState.ui.selectedNodeId;
  const [vp, setVp] = useState<CanvasViewport>(
    () => viewport ?? workflow.viewport ?? DEFAULT_VIEWPORT
  );
  const [livePositions, setLivePositions] = useState<Record<string, { x: number; y: number }>>({});
  const [draft, setDraft] = useState<ConnectSession | null>(null);
  const [hoverEdgeId, setHoverEdgeId] = useState<string | null>(null);
  const [spacePan, setSpacePan] = useState(false);
  const [pulses, setPulses] = useState<FlowPulse[]>([]);
  const [pulseT, setPulseT] = useState(0);
  const execFilter = appState.ui.executionFilter ?? 'all';

  const panRef = useRef<PanSession | null>(null);
  const dragRef = useRef<DragNodeSession | null>(null);
  const connectRef = useRef<ConnectSession | null>(null);
  const vpRef = useRef(vp);
  const saveVpTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactingRef = useRef(false);

  // Reset local state on workflow switch
  useEffect(() => {
    setVp(viewport ?? workflow.viewport ?? DEFAULT_VIEWPORT);
    StateStore.closeInspector();
    setLivePositions({});
    setDraft(null);
  }, [workflow.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync depuis toolbar parent (zoom +/-) si pas en interaction locale
  useEffect(() => {
    if (!viewport) return;
    if (interactingRef.current) return;
    if (
      viewport.x === vpRef.current.x &&
      viewport.y === vpRef.current.y &&
      viewport.zoom === vpRef.current.zoom
    ) {
      return;
    }
    setVp(viewport);
  }, [viewport]);

  useEffect(() => {
    vpRef.current = vp;
  }, [vp]);

  const commitViewport = useCallback(
    (next: CanvasViewport) => {
      setVp(next);
      onViewportChange?.(next);
      if (saveVpTimer.current) clearTimeout(saveVpTimer.current);
      saveVpTimer.current = setTimeout(() => {
        WorkflowEngine.saveViewport(workflow.id, next);
      }, 400);
    },
    [workflow.id, onViewportChange]
  );

  // Impulsions de flux (propagation)
  useEffect(() => {
    const unsub = EventBus.subscribe(AppEvents.FLOW_PULSE, (payload) => {
      const p = payload as FlowPulse;
      if (!p?.edgeId || p.workflowId !== workflow.id) return;
      setPulses((prev) => [...prev.slice(-12), p]);
      window.setTimeout(() => {
        setPulses((prev) => prev.filter((x) => x.id !== p.id));
      }, 900);
    });
    return unsub;
  }, [workflow.id]);

  useEffect(() => {
    if (pulses.length === 0) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = ((now - start) % 900) / 900;
      setPulseT(t);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [pulses.length]);

  // Space = pan mode
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        const t = e.target as HTMLElement;
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
        e.preventDefault();
        setSpacePan(true);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const t = e.target as HTMLElement;
        if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') return;
        if (selectedId) {
          e.preventDefault();
          WorkflowEngine.deleteNode(workflow.id, selectedId);
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePan(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [selectedId, workflow.id]);

  const nodes = workflow.nodes;
  const edges = workflow.edges;

  const connections = useMemo(
    () => renderConnections(edges, nodes, livePositions),
    [edges, nodes, livePositions]
  );

  const nodeStateMap = useMemo(() => {
    const m = new Map<string, ReturnType<typeof getExecutionState>>();
    nodes.forEach((n) => m.set(n.id, getExecutionState(n)));
    return m;
  }, [nodes]);

  const getRect = () => containerRef.current!.getBoundingClientRect();

  // ─── Wheel zoom ───────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const current = vpRef.current;

      // Pinch trackpad ou ctrl+wheel
      if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) < 40) {
        const factor = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        const next = zoomAtPoint(current, e.clientX, e.clientY, rect, current.zoom + factor);
        commitViewport(next);
      } else {
        // Scroll = pan
        commitViewport({
          ...current,
          x: current.x - e.deltaX,
          y: current.y - e.deltaY,
        });
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [commitViewport]);

  // ─── Pinch-to-zoom tactile (mobile) ───────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let pinchStartDist = 0;
    let pinchStartZoom = 1;
    let pinchCx = 0;
    let pinchCy = 0;

    const touchDist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchStartDist = touchDist(e.touches[0], e.touches[1]);
        pinchStartZoom = vpRef.current.zoom;
        pinchCx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        pinchCy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        // annule pan/drag en cours
        panRef.current = null;
        dragRef.current = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartDist > 0) {
        e.preventDefault();
        const d = touchDist(e.touches[0], e.touches[1]);
        const scale = d / pinchStartDist;
        const rect = el.getBoundingClientRect();
        const nextZoom = clampZoom(pinchStartZoom * scale);
        const next = zoomAtPoint(
          { ...vpRef.current, zoom: pinchStartZoom },
          pinchCx,
          pinchCy,
          rect,
          nextZoom
        );
        // conserve le pan relatif au pinch start
        setVp(next);
        interactingRef.current = true;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2 && pinchStartDist > 0) {
        pinchStartDist = 0;
        interactingRef.current = false;
        commitViewport(vpRef.current);
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [commitViewport]);

  // ─── Global pointer move / up ─────────────────────────
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      // Pan
      if (panRef.current) {
        interactingRef.current = true;
        const s = panRef.current;
        const dx = e.clientX - s.startX;
        const dy = e.clientY - s.startY;
        setVp({
          ...vpRef.current,
          x: s.originVpX + dx,
          y: s.originVpY + dy,
          zoom: vpRef.current.zoom,
        });
        return;
      }

      // Drag node
      if (dragRef.current) {
        const s = dragRef.current;
        const rect = getRect();
        const world = screenToWorld(e.clientX, e.clientY, rect, vpRef.current);
        const nx = s.originX + (world.x - s.startWorldX);
        const ny = s.originY + (world.y - s.startWorldY);
        setLivePositions((prev) => ({ ...prev, [s.nodeId]: { x: nx, y: ny } }));
        return;
      }

      // Connect draft
      if (connectRef.current) {
        const rect = getRect();
        const world = screenToWorld(e.clientX, e.clientY, rect, vpRef.current);
        const next = { ...connectRef.current, toX: world.x, toY: world.y };
        connectRef.current = next;
        setDraft(next);
      }
    };

    const onUp = (e: PointerEvent) => {
      // Fin pan
      if (panRef.current) {
        const s = panRef.current;
        const dx = e.clientX - s.startX;
        const dy = e.clientY - s.startY;
        const next = {
          ...vpRef.current,
          x: s.originVpX + dx,
          y: s.originVpY + dy,
        };
        panRef.current = null;
        interactingRef.current = false;
        commitViewport(next);
        return;
      }

      // Fin drag node → commit via engine
      if (dragRef.current) {
        const s = dragRef.current;
        const rect = getRect();
        const world = screenToWorld(e.clientX, e.clientY, rect, vpRef.current);
        const nx = Math.round(s.originX + (world.x - s.startWorldX));
        const ny = Math.round(s.originY + (world.y - s.startWorldY));
        dragRef.current = null;
        setLivePositions((prev) => {
          const { [s.nodeId]: _, ...rest } = prev;
          return rest;
        });
        // Émet NODE_MOVED via le moteur (StateStore valide)
        WorkflowEngine.moveNode(workflow.id, s.nodeId, nx, ny);
        return;
      }

      // Fin connexion — détecte ancre input sous le pointeur
      if (connectRef.current) {
        const session = connectRef.current;
        connectRef.current = null;
        setDraft(null);

        const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
        const anchor = el?.closest?.('[data-anchor="input"]') as HTMLElement | null;
        const targetId = anchor?.getAttribute('data-node-id');
        if (targetId && targetId !== session.sourceNodeId) {
          // CREATE_CONNECTION_REQUESTED pattern via engine
          WorkflowEngine.connectNodes(workflow.id, session.sourceNodeId, targetId);
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [commitViewport, workflow.id]);

  const startPan = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    panRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originVpX: vp.x,
      originVpY: vp.y,
      pointerId: e.pointerId,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onCanvasPointerDown = (e: React.PointerEvent) => {
    const t = e.target as HTMLElement;
    // Clic sur fond uniquement
    if (t.closest('[data-node-id]') || t.closest('[data-edge-id]')) return;

    // Ferme l'inspecteur (clic arrière-plan canvas)
    StateStore.closeInspector();

    // Middle click, space, or empty drag = pan
    if (e.button === 1 || spacePan || e.button === 0) {
      startPan(e);
    }
  };

  const onNodePointerDown = (e: React.PointerEvent, nodeId: string) => {
    if (spacePan || e.button === 1) {
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    e.stopPropagation();

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const pos = livePositions[nodeId] ?? { x: node.x, y: node.y };
    const rect = getRect();
    const world = screenToWorld(e.clientX, e.clientY, rect, vp);

    dragRef.current = {
      nodeId,
      originX: pos.x,
      originY: pos.y,
      startWorldX: world.x,
      startWorldY: world.y,
    };
  };

  const onOutputPointerDown = (e: React.PointerEvent, nodeId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const pos = livePositions[nodeId] ?? { x: node.x, y: node.y };
    const anchor = getOutputAnchor({ x: pos.x, y: pos.y });
    const rect = getRect();
    const world = screenToWorld(e.clientX, e.clientY, rect, vp);
    const session: ConnectSession = {
      sourceNodeId: nodeId,
      fromX: anchor.x,
      fromY: anchor.y,
      toX: world.x,
      toY: world.y,
    };
    connectRef.current = session;
    setDraft(session);
  };

  const onInputPointerUp = (_e: React.PointerEvent, _nodeId: string) => {
    // Géré dans window pointerup via elementFromPoint
  };

  const resolvedNode = (n: WorkflowNode) => {
    const live = livePositions[n.id];
    return live ? { ...n, x: live.x, y: live.y } : n;
  };

  const draftPath = draft
    ? (() => {
        const src = nodes.find((n) => n.id === draft.sourceNodeId);
        if (!src) return '';
        const pos = livePositions[src.id] ?? { x: src.x, y: src.y };
        return renderDraftConnection(pos, { x: draft.toX, y: draft.toY });
      })()
    : '';

  const zoomPct = Math.round(vp.zoom * 100);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col">
      {/* Canvas surface */}
      <div
        ref={containerRef}
        className={`fm-canvas relative flex-1 min-h-0 overflow-hidden bg-[#090a0f] ${
          spacePan ? 'cursor-grab' : 'cursor-default'
        } ${panRef.current ? 'cursor-grabbing' : ''}`}
        onPointerDown={onCanvasPointerDown}
        onDoubleClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest('[data-node-id]')) return;
          const rect = getRect();
          const world = screenToWorld(e.clientX, e.clientY, rect, vp);
          WorkflowEngine.addNode(workflow.id, {
            type: 'action',
            x: world.x - NODE_WIDTH / 2,
            y: world.y - NODE_HEIGHT / 2,
          });
        }}
      >
        {/* Dot grid (screen-space, pan-aware) */}
        <div className="absolute inset-0 pointer-events-none" style={gridBackground(vp)} />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-indigo-500/[0.03] via-transparent to-violet-500/[0.04]" />

        {/* World layer */}
        <div
          className="absolute left-0 top-0 origin-top-left will-change-transform"
          style={{ transform: viewportTransform(vp), width: 1, height: 1 }}
        >
          {/* SVG connections */}
          <svg
            className="fm-connections absolute overflow-visible"
            style={{ left: 0, top: 0, width: 1, height: 1, overflow: 'visible' }}
          >
            <defs>
              <linearGradient id="fm-edge-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="rgba(129,140,248,0.85)" />
                <stop offset="100%" stopColor="rgba(167,139,250,0.85)" />
              </linearGradient>
              <marker
                id="fm-arrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 1 L 8 5 L 0 9 z" fill="rgba(167,139,250,0.9)" />
              </marker>
            </defs>

            {connections.map((c) => {
              const hot = hoverEdgeId === c.id;
              const srcState = nodeStateMap.get(c.source);
              const stroke = edgeStrokeForStates(srcState, hot);
              const activeFlow =
                srcState === 'completed' ||
                srcState === 'in_progress' ||
                srcState === 'skipped';
              return (
                <g key={c.id} data-edge-id={c.id}>
                  <path
                    d={c.path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={18}
                    className="cursor-pointer"
                    onMouseEnter={() => setHoverEdgeId(c.id)}
                    onMouseLeave={() => setHoverEdgeId((id) => (id === c.id ? null : id))}
                    onClick={(e) => {
                      e.stopPropagation();
                      WorkflowEngine.deleteConnection(workflow.id, c.id);
                    }}
                  />
                  <path
                    d={c.path}
                    fill="none"
                    stroke={stroke}
                    strokeWidth={hot ? 2.5 : activeFlow ? 2.25 : 2}
                    strokeLinecap="round"
                    markerEnd="url(#fm-arrow)"
                    className={`pointer-events-none transition-[stroke] duration-150 ${
                      activeFlow ? 'fm-edge-flow' : ''
                    }`}
                    style={{
                      filter: hot
                        ? 'drop-shadow(0 0 6px rgba(248,113,113,0.5))'
                        : activeFlow
                          ? 'drop-shadow(0 0 6px rgba(52,211,153,0.35))'
                          : 'drop-shadow(0 0 4px rgba(99,102,241,0.25))',
                    }}
                  />
                  {hot && (
                    <circle
                      cx={c.mid.x}
                      cy={c.mid.y}
                      r={10}
                      className="pointer-events-none"
                      fill="rgba(248,113,113,0.15)"
                      stroke="rgba(248,113,113,0.7)"
                      strokeWidth={1.5}
                    />
                  )}
                </g>
              );
            })}

            {/* Impulsions lumineuses de propagation */}
            {pulses.map((p) => {
              const conn = connections.find((c) => c.id === p.edgeId);
              if (!conn) return null;
              const age = Math.min(1, (Date.now() - p.createdAt) / 900);
              const t = Math.min(1, age + pulseT * 0.15);
              const pt = bezierPoint(conn.from, conn.to, t);
              const color = PULSE_COLORS[p.kind] ?? PULSE_COLORS.activate;
              return (
                <g key={p.id} className="pointer-events-none fm-flow-pulse">
                  <circle cx={pt.x} cy={pt.y} r={7} fill={color} opacity={0.25} />
                  <circle cx={pt.x} cy={pt.y} r={3.5} fill={color} opacity={0.95}>
                    <animate
                      attributeName="opacity"
                      values="0.4;1;0.3"
                      dur="0.9s"
                      repeatCount="1"
                    />
                  </circle>
                </g>
              );
            })}

            {/* Draft connection */}
            {draftPath && (
              <path
                d={draftPath}
                fill="none"
                stroke="rgba(129,140,248,0.7)"
                strokeWidth={2}
                strokeDasharray="6 4"
                strokeLinecap="round"
                className="pointer-events-none"
              />
            )}
          </svg>

          {/* Nodes */}
          {nodes.map((n) => {
            const st = getExecutionState(n);
            const dimmed = execFilter !== 'all' && st !== execFilter;
            return (
              <NodeCard
                key={n.id}
                node={resolvedNode(n)}
                selected={selectedId === n.id}
                livePos={livePositions[n.id]}
                dimmed={dimmed}
                onPointerDownBody={onNodePointerDown}
                onPointerDownOutput={onOutputPointerDown}
                onPointerUpInput={onInputPointerUp}
                onSelect={(id) => WorkflowEngine.selectNode(id)}
                onDelete={(id) => {
                  WorkflowEngine.deleteNode(workflow.id, id);
                }}
                onLabelChange={(id, label) =>
                  WorkflowEngine.updateNode(workflow.id, id, { label })
                }
                onStart={(id) => ExecutionEngine.startNode(workflow.id, id)}
                onComplete={(id) => ExecutionEngine.completeNode(workflow.id, id)}
              />
            );
          })}
        </div>

        {/* Empty hint */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center px-6">
              <p className="text-sm font-medium text-zinc-300 mb-1">Canvas vide</p>
              <p className="text-xs text-zinc-600 max-w-xs leading-relaxed">
                Double-cliquez pour ajouter un nœud · Glissez depuis l'ancre droite pour connecter
              </p>
            </div>
          </div>
        )}

        {/* Mini legend */}
        <div className="absolute left-3 bottom-3 pointer-events-none hidden sm:flex items-center gap-3 text-[10px] text-zinc-600 bg-black/30 backdrop-blur px-2.5 py-1.5 rounded-lg border border-white/[0.05]">
          <span>Molette zoom</span>
          <span className="opacity-40">·</span>
          <span>Glisser fond = pan</span>
          <span className="opacity-40">·</span>
          <span>Clic lien = supprimer</span>
        </div>
      </div>

      {/* Zoom controls (exposed via data for parent optional) */}
      <div className="sr-only" data-zoom={zoomPct} aria-hidden />
    </div>
  );
}

/** Contrôles zoom externes */
export function ZoomControls({
  zoom,
  onZoom,
  onFit,
}: {
  zoom: number;
  onZoom: (z: number) => void;
  onFit?: () => void;
}) {
  const pct = Math.round(zoom * 100);
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5">
      <button
        type="button"
        className="w-7 h-7 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] text-sm font-medium"
        onClick={() => onZoom(clampZoom(zoom - ZOOM_STEP))}
        title="Zoom arrière"
      >
        −
      </button>
      <button
        type="button"
        className="min-w-[3.25rem] h-7 px-1 rounded-md text-[11px] font-mono tabular-nums text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
        onClick={() => onZoom(1)}
        title="Réinitialiser 100%"
      >
        {pct}%
      </button>
      <button
        type="button"
        className="w-7 h-7 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.06] text-sm font-medium"
        onClick={() => onZoom(clampZoom(zoom + ZOOM_STEP))}
        title="Zoom avant"
      >
        +
      </button>
      {onFit && (
        <button
          type="button"
          className="h-7 px-2 rounded-md text-[10px] text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]"
          onClick={onFit}
        >
          Fit
        </button>
      )}
    </div>
  );
}

// re-export helper used by view
export { buildBezierPath, clampZoom, DEFAULT_VIEWPORT, zoomAtPoint };
