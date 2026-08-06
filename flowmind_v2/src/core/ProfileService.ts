/**
 * FlowMind — ProfileService
 * Lecture / mise à jour profil + dual-write hybride
 * Équipe MILMA Entreprise
 */

import { EventBus } from './EventBus';
import {
  AuthService,
  authHashPassword,
  authLoadUsers,
  authSaveUsers,
  authToPublicUser,
  authVerifyPassword,
} from './AuthService';
import { uid } from './StateStore';
import {
  AppEvents,
  type AuthUser,
  type ExtendedUserProfile,
  type PasswordChangePayload,
  type ProfileUpdatePayload,
  type UserProfile,
  type UserProfilePreferences,
} from './Types';
import { HybridStorageAdapter } from './storage/HybridStorageAdapter';
import { LocalStorageAdapter } from './storage/LocalStorageAdapter';

const DEFAULT_PREFS: UserProfilePreferences = {
  locale: 'fr',
  notifyEmail: true,
  publicProfile: false,
};

function toProfile(user: AuthUser): UserProfile {
  return {
    ...user,
    avatarUrl: user.avatarUrl ?? null,
    role: user.role ?? null,
    bio: user.bio ?? null,
    preferences: {
      ...DEFAULT_PREFS,
      ...(user.preferences ?? {}),
    },
  };
}

class ProfileServiceImpl {
  /**
   * Fast-read : cache hybride local d'abord, sinon store auth users.
   */
  fetchProfile(userId?: string): UserProfile | null {
    const session = AuthService.getSession();
    const id = userId || session?.user.id;
    if (!id) return null;

    // Zero-latency hybrid cache
    const cached = HybridStorageAdapter.getUserProfileFast(id);
    if (cached) return cached;

    const users = authLoadUsers();
    const stored = users.find((u) => u.id === id);
    if (!stored) {
      return session?.user ? toProfile(session.user) : null;
    }
    const profile = toProfile(authToPublicUser(stored));
    // Seed cache local sans bloquer
    void HybridStorageAdapter.saveUserProfile(profile).catch(() => {
      /* ignore */
    });
    return profile;
  }

  /** Extended profile with sync flags */
  fetchExtendedProfile(userId?: string): ExtendedUserProfile | null {
    const id = userId || AuthService.getSession()?.user.id;
    if (!id) return null;
    const fast = HybridStorageAdapter.getUserProfileFast(id);
    if (fast) return fast;
    const base = this.fetchProfile(id);
    if (!base) return null;
    return LocalStorageAdapter.fromUserProfile(base, {
      pendingSync: false,
      lastSyncedAt: null,
    });
  }

  /**
   * Met à jour profil : auth store local + dual-write hybride
   */
  async updateProfile(
    userId: string,
    payload: ProfileUpdatePayload
  ): Promise<{ ok: boolean; profile?: UserProfile; error?: string }> {
    const users = authLoadUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx < 0) {
      return { ok: false, error: 'Utilisateur introuvable' };
    }

    const current = users[idx];
    const nextPrefs: UserProfilePreferences = {
      ...DEFAULT_PREFS,
      ...(current.preferences ?? {}),
      ...(payload.preferences ?? {}),
    };

    const displayName =
      payload.displayName !== undefined
        ? payload.displayName.trim()
        : current.displayName;

    if (!displayName || displayName.length < 2) {
      return { ok: false, error: 'Le nom doit contenir au moins 2 caractères' };
    }

    if (payload.avatarUrl && payload.avatarUrl.length > 2048) {
      return { ok: false, error: "URL d'avatar trop longue" };
    }

    users[idx] = {
      ...current,
      displayName,
      avatarUrl:
        payload.avatarUrl !== undefined
          ? payload.avatarUrl?.trim() || null
          : current.avatarUrl ?? null,
      role:
        payload.role !== undefined
          ? payload.role?.trim() || null
          : current.role ?? null,
      bio:
        payload.bio !== undefined
          ? payload.bio?.trim().slice(0, 280) || null
          : current.bio ?? null,
      preferences: nextPrefs,
    };

    authSaveUsers(users);
    const publicUser = authToPublicUser(users[idx]);
    const profile = toProfile(publicUser);

    // Session JWT locale
    const session = AuthService.getSession();
    if (session && session.user.id === userId) {
      AuthService.refreshSessionUser(publicUser);
      EventBus.publish(AppEvents.AUTH_SIGNED_IN, {
        session: AuthService.getSession(),
      });
    }

    // Dual-write hybride (local immédiat + remote async)
    const extended = await HybridStorageAdapter.saveUserProfile(profile);

    EventBus.publish(AppEvents.AUTH_PROFILE_UPDATED, { profile: extended });
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type: 'success',
      title: 'Profil mis à jour',
      description: extended.pendingSync
        ? 'Enregistré localement · sync en attente'
        : extended.displayName,
      duration: 2400,
    });

    return { ok: true, profile: extended };
  }

  async changePassword(
    userId: string,
    payload: PasswordChangePayload
  ): Promise<{ ok: boolean; error?: string }> {
    const { currentPassword, newPassword } = payload;
    if (!currentPassword || !newPassword) {
      return { ok: false, error: 'Champs requis manquants' };
    }
    if (newPassword.length < 8) {
      return { ok: false, error: 'Nouveau mot de passe : 8 caractères min.' };
    }
    if (currentPassword === newPassword) {
      return {
        ok: false,
        error: "Le nouveau mot de passe doit être différent de l'actuel",
      };
    }

    const users = authLoadUsers();
    const idx = users.findIndex((u) => u.id === userId);
    if (idx < 0) return { ok: false, error: 'Utilisateur introuvable' };

    const ok = await authVerifyPassword(
      currentPassword,
      users[idx].passwordHash
    );
    if (!ok) {
      return { ok: false, error: 'Mot de passe actuel incorrect' };
    }

    users[idx] = {
      ...users[idx],
      passwordHash: await authHashPassword(newPassword),
    };
    authSaveUsers(users);

    EventBus.publish(AppEvents.AUTH_PASSWORD_CHANGED, { userId });
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type: 'success',
      title: 'Mot de passe modifié',
      description: 'Vos prochains logins utiliseront le nouveau secret',
      duration: 2800,
    });

    return { ok: true };
  }

  getInitials(user: Pick<AuthUser, 'displayName' | 'email'>): string {
    return (user.displayName || user.email)
      .split(/\s|@/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? '')
      .join('');
  }
}

export const ProfileService = new ProfileServiceImpl();
export default ProfileService;
