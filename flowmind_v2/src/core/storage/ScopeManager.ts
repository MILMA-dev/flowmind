/**
 * ScopeManager — isolation multi-comptes du stockage local
 * Préfixe strict : flowmind_usr_<userId>_*
 * Équipe MILMA Entreprise
 */

import { EventBus } from '../EventBus';
import { AppEvents, type ScopeConfig } from '../Types';

const GUEST_ID = 'guest';
const LEGACY_APP_KEY = 'flowmind:app-state:v1';
const LEGACY_META_KEY = 'flowmind:meta:v1';

class ScopeManagerImpl {
  private userId: string | null = null;
  private mode: 'guest' | 'user' = 'guest';

  getUserId(): string | null {
    return this.userId;
  }

  getMode(): 'guest' | 'user' {
    return this.mode;
  }

  getConfig(): ScopeConfig {
    const id = this.userId ?? GUEST_ID;
    return {
      userId: this.userId,
      mode: this.mode,
      prefix: this.getPrefix(id),
    };
  }

  getPrefix(userId: string = this.userId ?? GUEST_ID): string {
    return `flowmind_usr_${userId}_`;
  }

  /**
   * Clé scopée dynamique
   * getScopedKey(userId, 'app-state') => flowmind_usr_<id>_app-state
   */
  getScopedKey(userId: string | null, entityKey: string): string {
    const id = userId ?? this.userId ?? GUEST_ID;
    return `${this.getPrefix(id)}${entityKey}`;
  }

  /** Clés courantes pour l'état app */
  appStateKey(): string {
    return this.getScopedKey(this.userId, 'app-state');
  }

  appMetaKey(): string {
    return this.getScopedKey(this.userId, 'app-meta');
  }

  cloudSnapshotKey(userId?: string): string {
    return this.getScopedKey(userId ?? this.userId, 'cloud-snapshot');
  }

  entityQueueKey(userId?: string): string {
    return this.getScopedKey(userId ?? this.userId, 'entity-sync-queue');
  }

  deviceIdKey(): string {
    return 'flowmind_device_id';
  }

  /**
   * Bascule de scope (login / logout / switch compte).
   * Ne purge PAS les données de l'autre compte — isole seulement le pointeur actif.
   */
  switchTo(userId: string | null): ScopeConfig {
    const prev = this.getConfig();
    this.userId = userId;
    this.mode = userId ? 'user' : 'guest';
    const next = this.getConfig();

    // Migration one-shot : données legacy non scopées → premier user
    if (userId) {
      this.migrateLegacyIfNeeded(userId);
    }

    EventBus.publish(AppEvents.SCOPE_CHANGED, {
      previous: prev,
      next,
    });
    return next;
  }

  switchToGuest(): ScopeConfig {
    return this.switchTo(null);
  }

  /**
   * Si l'ancien stockage global existe et que le scope user est vide,
   * copie les données vers le scope utilisateur (premier login).
   */
  private migrateLegacyIfNeeded(userId: string): void {
    try {
      const scopedKey = this.getScopedKey(userId, 'app-state');
      if (localStorage.getItem(scopedKey)) return;
      const legacy = localStorage.getItem(LEGACY_APP_KEY);
      if (!legacy) return;
      localStorage.setItem(scopedKey, legacy);
      const legacyMeta = localStorage.getItem(LEGACY_META_KEY);
      if (legacyMeta) {
        localStorage.setItem(this.getScopedKey(userId, 'app-meta'), legacyMeta);
      }
      // Ne supprime pas legacy tout de suite (sécurité multi-onglets) —
      // marqué migré
      localStorage.setItem(
        this.getScopedKey(userId, 'legacy-migrated'),
        new Date().toISOString()
      );
    } catch (e) {
      console.warn('[ScopeManager] migration legacy échouée', e);
    }
  }

  /** Liste les scopes user présents dans localStorage */
  listLocalUserScopes(): string[] {
    const ids = new Set<string>();
    const re = /^flowmind_usr_([^_]+)_app-state$/;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      const m = k.match(re);
      if (m && m[1] !== GUEST_ID) ids.add(m[1]);
    }
    return Array.from(ids);
  }
}

export const ScopeManager = new ScopeManagerImpl();
export default ScopeManager;
