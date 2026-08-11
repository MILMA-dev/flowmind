/**
 * ConnectionRenderer — Courbes de Bézier SVG multi-connexions (1→N / N→1)
 * Équipe MILMA — Développeur Core System
 *
 * Fan-out / fan-in : décalage vertical des ancres quand plusieurs
 * arêtes partagent le même nœud source ou cible.
 */

import { NODE_HEIGHT, NODE_WIDTH } from '../../../core/Types';
import type { WorkflowEdge, WorkflowNode } from '../../../core/Types';

export interface Point {
  x: number;
  y: number;
}

const ANCHOR_SPREAD = 14; // px entre slots multi-liens

/** Position world-space de l'ancre Output (droite) avec slot optionnel */
export function getOutputAnchor(
  node: Pick<WorkflowNode, 'x' | 'y'>,
  slot = 0,
  slotCount = 1
): Point {
  const mid = node.y + NODE_HEIGHT / 2;
  const offset = slotOffset(slot, slotCount);
  return {
    x: node.x + NODE_WIDTH,
    y: mid + offset,
  };
}

/** Position world-space de l'ancre Input (gauche) avec slot optionnel */
export function getInputAnchor(
  node: Pick<WorkflowNode, 'x' | 'y'>,
  slot = 0,
  slotCount = 1
): Point {
  const mid = node.y + NODE_HEIGHT / 2;
  const offset = slotOffset(slot, slotCount);
  return {
    x: node.x,
    y: mid + offset,
  };
}

function slotOffset(slot: number, slotCount: number): number {
  if (slotCount <= 1) return 0;
  const centered = slot - (slotCount - 1) / 2;
  return centered * ANCHOR_SPREAD;
}

/**
 * Génère le path SVG d'une courbe de Bézier fluide.
 */
export function buildBezierPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): string {
  const deltaX = Math.abs(x2 - x1);
  const curvature = Math.max(deltaX * 0.5, 48);
  // Légère compensation verticale pour courbes multi-ports
  const c1x = x1 + curvature;
  const c1y = y1;
  const c2x = x2 - curvature;
  const c2y = y2;
  return `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`;
}

export function buildBezierFromPoints(from: Point, to: Point): string {
  return buildBezierPath(from.x, from.y, to.x, to.y);
}

export function bezierMidpoint(from: Point, to: Point): Point {
  const deltaX = Math.abs(to.x - from.x);
  const curvature = Math.max(deltaX * 0.5, 48);
  const c1x = from.x + curvature;
  const c1y = from.y;
  const c2x = to.x - curvature;
  const c2y = to.y;
  const t = 0.5;
  const mt = 1 - t;
  const x =
    mt * mt * mt * from.x +
    3 * mt * mt * t * c1x +
    3 * mt * t * t * c2x +
    t * t * t * to.x;
  const y =
    mt * mt * mt * from.y +
    3 * mt * mt * t * c1y +
    3 * mt * t * t * c2y +
    t * t * t * to.y;
  return { x, y };
}

export interface RenderedConnection {
  id: string;
  path: string;
  mid: Point;
  source: string;
  target: string;
  label?: string;
  from: Point;
  to: Point;
  sourceSlot: number;
  targetSlot: number;
}

/** Point sur courbe de Bézier à t ∈ [0,1] */
export function bezierPoint(from: Point, to: Point, t: number): Point {
  const deltaX = Math.abs(to.x - from.x);
  const curvature = Math.max(deltaX * 0.5, 48);
  const c1x = from.x + curvature;
  const c1y = from.y;
  const c2x = to.x - curvature;
  const c2y = to.y;
  const mt = 1 - t;
  return {
    x:
      mt * mt * mt * from.x +
      3 * mt * mt * t * c1x +
      3 * mt * t * t * c2x +
      t * t * t * to.x,
    y:
      mt * mt * mt * from.y +
      3 * mt * mt * t * c1y +
      3 * mt * t * t * c2y +
      t * t * t * to.y,
  };
}

export const PULSE_COLORS = {
  success: '#34d399',
  failure: '#f43f5e',
  activate: '#818cf8',
} as const;

/**
 * Calcule les slots fan-out (par source) et fan-in (par target)
 * puis génère les courbes décalées.
 */
export function renderConnections(
  edges: WorkflowEdge[],
  nodes: WorkflowNode[],
  positionsOverride?: Record<string, Point>
): RenderedConnection[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  // Groupes pour multi-liens
  const bySource = new Map<string, WorkflowEdge[]>();
  const byTarget = new Map<string, WorkflowEdge[]>();
  for (const e of edges) {
    if (!bySource.has(e.source)) bySource.set(e.source, []);
    bySource.get(e.source)!.push(e);
    if (!byTarget.has(e.target)) byTarget.set(e.target, []);
    byTarget.get(e.target)!.push(e);
  }

  // Index stable par id d'edge
  const sourceSlotOf = new Map<string, { slot: number; count: number }>();
  const targetSlotOf = new Map<string, { slot: number; count: number }>();

  for (const [, group] of bySource) {
    group.forEach((e, i) => {
      sourceSlotOf.set(e.id, { slot: e.sourceSlot ?? i, count: group.length });
    });
  }
  for (const [, group] of byTarget) {
    group.forEach((e, i) => {
      targetSlotOf.set(e.id, { slot: e.targetSlot ?? i, count: group.length });
    });
  }

  const result: RenderedConnection[] = [];

  for (const edge of edges) {
    const src = byId.get(edge.source);
    const tgt = byId.get(edge.target);
    if (!src || !tgt) continue;

    const sx = positionsOverride?.[src.id]?.x ?? src.x;
    const sy = positionsOverride?.[src.id]?.y ?? src.y;
    const tx = positionsOverride?.[tgt.id]?.x ?? tgt.x;
    const ty = positionsOverride?.[tgt.id]?.y ?? tgt.y;

    const sSlot = sourceSlotOf.get(edge.id) ?? { slot: 0, count: 1 };
    const tSlot = targetSlotOf.get(edge.id) ?? { slot: 0, count: 1 };

    const from = getOutputAnchor({ x: sx, y: sy }, sSlot.slot, sSlot.count);
    const to = getInputAnchor({ x: tx, y: ty }, tSlot.slot, tSlot.count);
    const path = buildBezierFromPoints(from, to);
    const mid = bezierMidpoint(from, to);

    result.push({
      id: edge.id,
      path,
      mid,
      source: edge.source,
      target: edge.target,
      label: edge.label,
      from,
      to,
      sourceSlot: sSlot.slot,
      targetSlot: tSlot.slot,
    });
  }

  return result;
}

/** Path temporaire pendant le drag de connexion */
export function renderDraftConnection(
  fromNode: Pick<WorkflowNode, 'x' | 'y'>,
  pointerWorld: Point,
  slot = 0,
  slotCount = 1
): string {
  const from = getOutputAnchor(fromNode, slot, slotCount);
  return buildBezierFromPoints(from, pointerWorld);
}
