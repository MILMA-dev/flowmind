import { db, type OfflineMutation } from '../storage/IndexedDBAdapter';
import { OfflineMutationQueue } from '../storage/OfflineMutationQueue';
import { RemoteDatabaseAdapter } from '../storage/RemoteDatabaseAdapter';
import { EventBus } from '../EventBus';
import { AppEvents } from '../Types';

export class OfflineQueueProcessor {
  private static isProcessing = false;
  private static retryIntervals = [2000, 4000, 8000, 16000];

  /**
   * Démarre l'écoute des événements de reconnexion réseau.
   */
  static register(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        console.log('[OfflineQueueProcessor] Reconnexion détectée, démarrage du dépilage...');
        EventBus.publish(AppEvents.NETWORK_ONLINE, {});
        void this.processQueue();
      });
      window.addEventListener('offline', () => {
        console.log('[OfflineQueueProcessor] Mode hors-ligne activé.');
        EventBus.publish(AppEvents.NETWORK_OFFLINE, {});
      });
    }
  }

  /**
   * Traite séquentiellement la file d'attente des mutations hors-ligne par ordre chronologique (timestamp ASC).
   */
  static async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    if (!navigator.onLine) return;

    const currentToken = RemoteDatabaseAdapter.getAuthToken();
    if (!currentToken) {
      console.warn('[OfflineQueueProcessor] Impossible de dépiler : utilisateur non authentifié (pas de token JWT)');
      return;
    }

    // Extraction de userId depuis le JWT token de façon défensive (compatible navigateur)
    let userId = 'unknown';
    try {
      const parts = currentToken.split('.');
      if (parts.length === 3) {
        const base64Url = parts[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(
          window.atob(base64)
            .split('')
            .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
            .join('')
        );
        const decoded = JSON.parse(jsonPayload);
        userId = decoded.sub || decoded.id || decoded.userId || 'unknown';
      }
    } catch {
      // ignore
    }

    this.isProcessing = true;
    console.log('[OfflineQueueProcessor] Début de traitement de la file...');

    try {
      const pendingMutations = await OfflineMutationQueue.getPending(userId);
      if (pendingMutations.length === 0) {
        console.log('[OfflineQueueProcessor] Aucune mutation hors-ligne en attente.');
        this.isProcessing = false;
        return;
      }

      console.log(`[OfflineQueueProcessor] ${pendingMutations.length} mutations en attente.`);

      for (const mutation of pendingMutations) {
        if (!mutation.id) continue;

        let success = false;
        let isFatal = false;
        let errorMessage = '';

        try {
          // Préparation du payload de batch de synchronisation delta
          const batch: Record<string, any[]> = {};
          const mappedKey = this.getBatchKey(mutation.entityType);
          batch[mappedKey] = [mutation.payload];

          // Tentative d'envoi vers l'API de push
          const res = await RemoteDatabaseAdapter.pushDeltas(batch);
          if (res.success) {
            success = true;
          }
        } catch (error: any) {
          errorMessage = error?.message || String(error);
          console.error(`[OfflineQueueProcessor] Échec mutation #${mutation.id}:`, error);

          // Si l'erreur est fatale (ex: mauvaise requête 4xx, conflit non récupérable), on ne réessaye pas indéfiniment
          if (errorMessage.includes('400') || errorMessage.includes('401') || errorMessage.includes('403') || errorMessage.includes('422')) {
            isFatal = true;
          }
        }

        if (success) {
          await OfflineMutationQueue.markSuccess(mutation.id);
          console.log(`[OfflineQueueProcessor] Mutation #${mutation.id} synchronisée avec succès.`);
        } else if (isFatal) {
          await OfflineMutationQueue.markFailed(mutation.id);
          EventBus.publish(AppEvents.TOAST_SHOW, {
            type: 'error',
            title: 'Échec de synchronisation',
            description: `Erreur définitive sur une modification hors-ligne.`,
          });
        } else {
          // Erreur réseau intermittente : application d'un backoff exponentiel
          await OfflineMutationQueue.incrementRetry(mutation.id);
          const currentRetries = mutation.retryCount;
          const delay = this.retryIntervals[Math.min(currentRetries, this.retryIntervals.length - 1)];

          console.log(`[OfflineQueueProcessor] Reconnexion perdue ou temporaire. Nouvelle tentative dans ${delay}ms...`);

          // On arrête le traitement de la file en attendant le prochain cycle/intervalle de backoff
          setTimeout(() => {
            this.isProcessing = false;
            void this.processQueue();
          }, delay);
          return;
        }
      }

      EventBus.publish(AppEvents.GLOBAL_SYNC_PUSHED, { count: pendingMutations.length });
    } catch (err) {
      console.error('[OfflineQueueProcessor] Erreur globale de traitement de la file :', err);
    } finally {
      this.isProcessing = false;
    }
  }

  private static getBatchKey(type: OfflineMutation['entityType']): string {
    switch (type) {
      case 'note':
        return 'notes';
      case 'todo':
        return 'todos';
      case 'calendarEvent':
        return 'calendarEvents';
      case 'workflow':
        return 'workflows';
      case 'workflowNode':
        return 'workflowNodes';
      case 'workflowEdge':
        return 'workflowEdges';
    }
  }
}
