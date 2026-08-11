/**
 * MicroFeedback — confettis / étincelles SVG à la complétion
 */
import { useEffect, useState, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { EventBus } from '../../../core/EventBus';
import { AppEvents } from '../../../core/Types';
import { StateStore } from '../../../core/StateStore';

interface Burst {
  id: string;
  x: number;
  y: number;
  colors: string[];
}

const PALETTES = [
  ['#818cf8', '#a78bfa', '#34d399', '#fbbf24', '#f472b6'],
  ['#22d3ee', '#34d399', '#818cf8', '#fbbf24'],
];

function particles(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.4;
    const dist = 28 + Math.random() * 52;
    return {
      id: i,
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 10,
      r: 2 + Math.random() * 3.5,
      delay: Math.random() * 0.05,
    };
  });
}

export default function MicroFeedback() {
  const [bursts, setBursts] = useState<Burst[]>([]);

  const spawn = useCallback((x?: number, y?: number) => {
    if (StateStore.getState().ui.microFeedback === false) return;
    if (StateStore.getState().ui.reduceMotion) return;

    const cx = x ?? window.innerWidth / 2;
    const cy = y ?? window.innerHeight * 0.35;
    const burst: Burst = {
      id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      x: cx,
      y: cy,
      colors: PALETTES[Math.floor(Math.random() * PALETTES.length)],
    };
    setBursts((prev) => [...prev.slice(-4), burst]);
    window.setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== burst.id));
    }, 900);
  }, []);

  useEffect(() => {
    const unsubs = [
      EventBus.subscribe(AppEvents.MICRO_FEEDBACK, (payload) => {
        const p = payload as { x?: number; y?: number };
        spawn(p?.x, p?.y);
      }),
      EventBus.subscribe(AppEvents.NODE_STATE_CHANGED, (payload) => {
        const p = payload as { executionState?: string };
        if (p?.executionState === 'completed') spawn();
      }),
      EventBus.subscribe(AppEvents.TODO_ITEM_TOGGLED, (payload) => {
        const p = payload as { item?: { isCompleted?: boolean } };
        if (p?.item?.isCompleted) spawn();
      }),
      EventBus.subscribe(AppEvents.EXECUTION_COMPLETED, () => spawn()),
      EventBus.subscribe(AppEvents.ENTITY_CONVERTED, () => {
        // petit feedback discret
        spawn(window.innerWidth - 80, 80);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [spawn]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[120] overflow-hidden">
      <AnimatePresence>
        {bursts.map((b) => {
          const parts = particles(14);
          return (
            <motion.div
              key={b.id}
              className="absolute"
              style={{ left: b.x, top: b.y }}
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* flash central */}
              <motion.span
                className="absolute -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white/80"
                initial={{ scale: 0.4, opacity: 0.9 }}
                animate={{ scale: 3, opacity: 0 }}
                transition={{ duration: 0.45 }}
              />
              <svg
                width="160"
                height="160"
                viewBox="-80 -80 160 160"
                className="absolute -translate-x-1/2 -translate-y-1/2 overflow-visible"
              >
                {parts.map((p) => (
                  <motion.circle
                    key={p.id}
                    r={p.r}
                    fill={b.colors[p.id % b.colors.length]}
                    initial={{ cx: 0, cy: 0, opacity: 1, scale: 1 }}
                    animate={{
                      cx: p.dx,
                      cy: p.dy,
                      opacity: 0,
                      scale: 0.2,
                    }}
                    transition={{
                      duration: 0.7,
                      delay: p.delay,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                ))}
              </svg>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

/** Déclenche un burst programmatique */
export function triggerMicroFeedback(x?: number, y?: number) {
  EventBus.publish(AppEvents.MICRO_FEEDBACK, { x, y });
}
