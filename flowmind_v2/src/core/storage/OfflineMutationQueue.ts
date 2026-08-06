import { db, type OfflineMutation } from './IndexedDBAdapter';

export class OfflineMutationQueue {
  /**
   * Enregistre une mutation hors-ligne dans la file d'attente Dexie.
   */
  static async enqueue(
    userId: string,
    entityType: OfflineMutation['entityType'],
    entityId: string,
    action: OfflineMutation['action'],
    payload: Record<string, any>
  ): Promise<number> {
    const mutation: OfflineMutation = {
      userId,
      entityType,
      entityId,
      action,
      payload,
      timestamp: new Date().toISOString(),
      retryCount: 0,
      status: 'PENDING',
    };
    return await db.offline_mutations.add(mutation);
  }

  /**
   * Récupère toutes les mutations en attente pour un utilisateur donné,
   * triées par ordre chronologique.
   */
  static async getPending(userId: string): Promise<OfflineMutation[]> {
    return await db.offline_mutations
      .where('userId')
      .equals(userId)
      .filter((m) => m.status === 'PENDING')
      .sortBy('timestamp');
  }

  /**
   * Marque une mutation comme réussie (et la supprime ou met à jour son statut).
   */
  static async markSuccess(id: number): Promise<void> {
    await db.offline_mutations.update(id, { status: 'SUCCESS' });
    // Optionnel: On peut aussi la supprimer physiquement pour libérer l'espace
    await db.offline_mutations.delete(id);
  }

  /**
   * Marque une mutation comme échouée de façon définitive (ex: erreur 4xx).
   */
  static async markFailed(id: number): Promise<void> {
    await db.offline_mutations.update(id, { status: 'FAILED' });
  }

  /**
   * Incrémente le nombre de tentatives en cas d'erreur de réseau temporaire.
   */
  static async incrementRetry(id: number): Promise<void> {
    const mutation = await db.offline_mutations.get(id);
    if (mutation) {
      await db.offline_mutations.update(id, {
        retryCount: mutation.retryCount + 1,
      });
    }
  }

  /**
   * Efface toutes les mutations de la file d'attente pour un utilisateur.
   */
  static async clearQueue(userId: string): Promise<void> {
    const ids = await db.offline_mutations
      .where('userId')
      .equals(userId)
      .primaryKeys();
    await db.offline_mutations.bulkDelete(ids);
  }
}
