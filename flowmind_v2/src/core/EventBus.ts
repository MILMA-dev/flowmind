/**
 * FlowMind — EventBus central (Pub/Sub découplé)
 * Équipe MILMA Entreprise
 *
 * ZÉRO COUPLAGE : aucun module UI ne modifie directement le state d'un autre.
 * Toutes les actions transitent par cet EventBus.
 */

type EventCallback = (payload: unknown) => void;

class EventBusImpl {
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private history: Array<{ event: string; payload: unknown; at: number }> = [];
  private maxHistory = 50;
  private debug = false;

  /** Active les logs de debug en console */
  setDebug(enabled: boolean): void {
    this.debug = enabled;
  }

  /**
   * S'abonne à un événement.
   * @returns fonction de désabonnement
   */
  subscribe(event: string, callback: EventCallback): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    if (this.debug) {
      console.debug(`[EventBus] +subscribe "${event}" (${this.listeners.get(event)!.size})`);
    }

    return () => this.unsubscribe(event, callback);
  }

  /** Émet un événement avec ses données contextuelles */
  publish(event: string, payload?: unknown): void {
    const entry = { event, payload, at: Date.now() };
    this.history.push(entry);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    if (this.debug) {
      console.debug(`[EventBus] publish "${event}"`, payload);
    }

    const callbacks = this.listeners.get(event);
    if (!callbacks || callbacks.size === 0) return;

    callbacks.forEach((cb) => {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[EventBus] Erreur listener "${event}":`, err);
      }
    });
  }

  /** Supprime un abonnement */
  unsubscribe(event: string, callback: EventCallback): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(callback);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  /** Supprime tous les abonnés d'un événement (ou tout le bus) */
  clear(event?: string): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /** Historique récent des publications (debug) */
  getHistory(): ReadonlyArray<{ event: string; payload: unknown; at: number }> {
    return this.history;
  }

  /** Nombre d'abonnés pour un événement */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

/** Instance singleton du bus applicatif */
export const EventBus = new EventBusImpl();
export default EventBus;
