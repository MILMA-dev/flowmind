/**
 * Hook pour s'abonner à l'EventBus de façon propre (cleanup auto)
 */
import { useEffect } from 'react';
import { EventBus } from '../core/EventBus';

export function useEventBus(
  event: string,
  handler: (payload: unknown) => void
): void {
  useEffect(() => {
    const unsub = EventBus.subscribe(event, handler);
    return unsub;
  }, [event, handler]);
}
