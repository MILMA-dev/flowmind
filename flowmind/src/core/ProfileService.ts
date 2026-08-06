/**
 * FlowMind — ProfileService
 * Gestion du cycle de vie du profil utilisateur (fetch, update)
 * Équipe MILMA Entreprise
 */

import { UserProfile, ProfileUpdatePayload } from './Types';

const PROFILE_STORAGE_KEY = 'flowmind:user-profile:v1';

class ProfileServiceImpl {
  /**
   * Récupère le profil utilisateur (simulé) associé à un UID
   */
  async fetchProfile(uid: string, email: string): Promise<UserProfile> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const raw = localStorage.getItem(`${PROFILE_STORAGE_KEY}:${uid}`);
        if (raw) {
          resolve(JSON.parse(raw) as UserProfile);
        } else {
          // Profil par défaut si aucun n'existe encore
          const defaultProfile: UserProfile = {
            uid,
            email,
            fullName: email.split('@')[0],
            role: 'Utilisateur FlowMind',
            avatarUrl: '',
            themePreference: 'dark-neutral',
            updatedAt: new Date().toISOString(),
          };
          localStorage.setItem(`${PROFILE_STORAGE_KEY}:${uid}`, JSON.stringify(defaultProfile));
          resolve(defaultProfile);
        }
      }, 400);
    });
  }

  /**
   * Met à jour le profil utilisateur
   */
  async updateProfile(uid: string, payload: ProfileUpdatePayload): Promise<UserProfile> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const raw = localStorage.getItem(`${PROFILE_STORAGE_KEY}:${uid}`);
        if (!raw) {
          reject(new Error('Profil introuvable.'));
          return;
        }

        const existing = JSON.parse(raw) as UserProfile;
        const updated: UserProfile = {
          ...existing,
          ...payload,
          updatedAt: new Date().toISOString(),
        };

        localStorage.setItem(`${PROFILE_STORAGE_KEY}:${uid}`, JSON.stringify(updated));
        resolve(updated);
      }, 500);
    });
  }
}

export const ProfileService = new ProfileServiceImpl();
export default ProfileService;
