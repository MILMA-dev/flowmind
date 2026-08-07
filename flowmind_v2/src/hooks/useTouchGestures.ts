/**
 * useTouchGestures — Pinch, Swipe, Long-Press (Touch-First mobile)
 * Équipe MILMA Entreprise
 */
import { useCallback, useRef } from 'react';
import { EventBus } from '../core/EventBus';
import { AppEvents, type TouchEventPayload } from '../core/Types';

export interface TouchGestureHandlers {
  onSwipe?: (
    direction: 'left' | 'right' | 'up' | 'down',
    velocity: number
  ) => void;
  onPinch?: (scale: number, delta: number) => void;
  onLongPress?: (x: number, y: number) => void;
  onTap?: (x: number, y: number) => void;
  /** Seuil swipe px */
  swipeThreshold?: number;
  longPressMs?: number;
  /** Empêche le scroll pendant pinch */
  preventScrollOnPinch?: boolean;
}

function dist(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number }
) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

/**
 * Attache les listeners tactiles à un élément (ref callback ou props)
 */
export function useTouchGestures(handlers: TouchGestureHandlers) {
  const startRef = useRef<{
    x: number;
    y: number;
    t: number;
    pinchDist: number | null;
  } | null>(null);
  const longTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScale = useRef(1);
  const moved = useRef(false);

  const clearLong = () => {
    if (longTimer.current) {
      clearTimeout(longTimer.current);
      longTimer.current = null;
    }
  };

  const publish = (payload: TouchEventPayload) => {
    EventBus.publish(AppEvents.TOUCH_GESTURE, payload);
  };

  const onTouchStart = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      const touches = 'nativeEvent' in e ? e.nativeEvent.touches : e.touches;
      moved.current = false;

      if (touches.length === 2) {
        clearLong();
        startRef.current = {
          x: 0,
          y: 0,
          t: Date.now(),
          pinchDist: dist(touches[0], touches[1]),
        };
        lastScale.current = 1;
        return;
      }

      if (touches.length === 1) {
        const t = touches[0];
        startRef.current = {
          x: t.clientX,
          y: t.clientY,
          t: Date.now(),
          pinchDist: null,
        };
        clearLong();
        longTimer.current = setTimeout(() => {
          if (!moved.current && startRef.current) {
            handlers.onLongPress?.(t.clientX, t.clientY);
            publish({
              kind: 'longpress',
              x: t.clientX,
              y: t.clientY,
            });
          }
        }, handlers.longPressMs ?? 480);
      }
    },
    [handlers]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      const touches = 'nativeEvent' in e ? e.nativeEvent.touches : e.touches;
      if (!startRef.current) return;

      if (touches.length === 2 && startRef.current.pinchDist) {
        if (handlers.preventScrollOnPinch) {
          e.preventDefault?.();
        }
        const d = dist(touches[0], touches[1]);
        const scale = d / startRef.current.pinchDist;
        const delta = scale - lastScale.current;
        lastScale.current = scale;
        handlers.onPinch?.(scale, delta);
        publish({ kind: 'pinch', scale });
        moved.current = true;
        return;
      }

      if (touches.length === 1) {
        const t = touches[0];
        const dx = t.clientX - startRef.current.x;
        const dy = t.clientY - startRef.current.y;
        if (Math.hypot(dx, dy) > 10) {
          moved.current = true;
          clearLong();
        }
      }
    },
    [handlers]
  );

  const onTouchEnd = useCallback(
    (e: React.TouchEvent | TouchEvent) => {
      clearLong();
      const start = startRef.current;
      startRef.current = null;

      if (!start || start.pinchDist) return;

      const changed =
        'nativeEvent' in e ? e.nativeEvent.changedTouches : e.changedTouches;
      if (!changed.length) return;
      const t = changed[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const dt = Math.max(Date.now() - start.t, 1);
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const threshold = handlers.swipeThreshold ?? 56;

      if (!moved.current && absX < 12 && absY < 12) {
        handlers.onTap?.(t.clientX, t.clientY);
        publish({ kind: 'tap', x: t.clientX, y: t.clientY });
        return;
      }

      if (absX < threshold && absY < threshold) return;

      let direction: 'left' | 'right' | 'up' | 'down';
      if (absX > absY) {
        direction = dx > 0 ? 'right' : 'left';
      } else {
        direction = dy > 0 ? 'down' : 'up';
      }
      const velocity = (absX > absY ? absX : absY) / dt;
      handlers.onSwipe?.(direction, velocity);
      publish({ kind: 'swipe', direction, velocity });
    },
    [handlers]
  );

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel: onTouchEnd,
  };
}

/**
 * Swipe-to-action sur une carte (translateX live)
 */
export function useSwipeAction(opts: {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
}) {
  const offset = useRef(0);
  const startX = useRef(0);
  const elRef = useRef<HTMLElement | null>(null);

  const bind = useCallback(
    (node: HTMLElement | null) => {
      elRef.current = node;
    },
    []
  );

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    offset.current = 0;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    offset.current = dx;
    if (elRef.current) {
      elRef.current.style.transform = `translateX(${dx}px)`;
      elRef.current.style.transition = 'none';
      const opacity = Math.max(0.4, 1 - Math.abs(dx) / 200);
      elRef.current.style.opacity = String(opacity);
    }
  }, []);

  const onTouchEnd = useCallback(() => {
    const th = opts.threshold ?? 80;
    const dx = offset.current;
    if (elRef.current) {
      elRef.current.style.transition = 'transform 0.25s ease, opacity 0.25s ease';
      if (dx < -th) {
        elRef.current.style.transform = 'translateX(-120%)';
        elRef.current.style.opacity = '0';
        window.setTimeout(() => opts.onSwipeLeft?.(), 200);
        return;
      }
      if (dx > th) {
        elRef.current.style.transform = 'translateX(120%)';
        elRef.current.style.opacity = '0';
        window.setTimeout(() => opts.onSwipeRight?.(), 200);
        return;
      }
      elRef.current.style.transform = '';
      elRef.current.style.opacity = '';
    }
    offset.current = 0;
  }, [opts]);

  return {
    bind,
    handlers: { onTouchStart, onTouchMove, onTouchEnd },
    offset,
  };
}
