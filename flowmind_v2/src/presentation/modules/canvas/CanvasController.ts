/**
 * CanvasController — Pan, Zoom & coordonnées world/screen
 * Équipe MILMA — Ingénieur Intégration & Performance
 *
 * Le canvas n'écrit PAS dans le StateStore pendant le drag :
 * il expose des helpers et émet des événements via callbacks.
 */

import type { CSSProperties } from 'react';
import type { CanvasViewport } from '../../../core/Types';

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;
export const ZOOM_STEP = 0.1;
export const DEFAULT_VIEWPORT: CanvasViewport = { x: 0, y: 0, zoom: 1 };

/** Clamp zoom dans les bornes */
export function clampZoom(z: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z * 100) / 100));
}

/** Screen (client) → World (canvas) */
export function screenToWorld(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  vp: CanvasViewport
): { x: number; y: number } {
  return {
    x: (clientX - rect.left - vp.x) / vp.zoom,
    y: (clientY - rect.top - vp.y) / vp.zoom,
  };
}

/** World → Screen relatif au conteneur */
export function worldToScreen(
  wx: number,
  wy: number,
  vp: CanvasViewport
): { x: number; y: number } {
  return {
    x: wx * vp.zoom + vp.x,
    y: wy * vp.zoom + vp.y,
  };
}

/**
 * Zoom centré sur un point écran (molette).
 * Conserve le point world sous le curseur.
 */
export function zoomAtPoint(
  vp: CanvasViewport,
  clientX: number,
  clientY: number,
  rect: DOMRect,
  nextZoom: number
): CanvasViewport {
  const z = clampZoom(nextZoom);
  if (z === vp.zoom) return vp;

  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  const worldX = (sx - vp.x) / vp.zoom;
  const worldY = (sy - vp.y) / vp.zoom;

  return {
    zoom: z,
    x: sx - worldX * z,
    y: sy - worldY * z,
  };
}

/** Applique un delta de pan en pixels écran */
export function panBy(vp: CanvasViewport, dx: number, dy: number): CanvasViewport {
  return { ...vp, x: vp.x + dx, y: vp.y + dy };
}

/** Centre le viewport sur un point world */
export function centerOn(
  worldX: number,
  worldY: number,
  width: number,
  height: number,
  zoom = 1
): CanvasViewport {
  const z = clampZoom(zoom);
  return {
    zoom: z,
    x: width / 2 - worldX * z,
    y: height / 2 - worldY * z,
  };
}

/** Style CSS transform pour le layer world */
export function viewportTransform(vp: CanvasViewport): string {
  return `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`;
}

/** Taille de grille adaptée au zoom (points) */
export function gridBackground(vp: CanvasViewport): CSSProperties {
  const size = 24 * vp.zoom;
  return {
    backgroundImage: `radial-gradient(circle, rgba(148,163,184,0.16) 1px, transparent 1px)`,
    backgroundSize: `${size}px ${size}px`,
    backgroundPosition: `${vp.x}px ${vp.y}px`,
  };
}

export type PointerMode = 'idle' | 'pan' | 'drag-node' | 'connect';

export interface DragNodeSession {
  nodeId: string;
  originX: number;
  originY: number;
  startWorldX: number;
  startWorldY: number;
}

export interface ConnectSession {
  sourceNodeId: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export interface PanSession {
  startX: number;
  startY: number;
  originVpX: number;
  originVpY: number;
  pointerId: number;
}
