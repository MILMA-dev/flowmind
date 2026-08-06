/**
 * FlowMind — AuthService
 * Service de gestion de l'authentification et de la validation e-mail
 * Équipe MILMA Entreprise
 */

import { Credentials, UserSession } from './Types';
import { StateStore } from './StateStore';
import { EventBus } from './EventBus';

const AUTH_STORAGE_KEY = 'flowmind:auth-session:v1';
const ACCOUNTS_STORAGE_KEY = 'flowmind:accounts:v1';

class AuthServiceImpl {
  /**
   * Récupère la liste des comptes simulés (Supabase / Firebase local-mock)
   */
  private getAccounts(): UserSession[] {
    try {
      const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
      return raw ? JSON.parse(raw) as UserSession[] : [];
    } catch {
      return [];
    }
  }

  private saveAccounts(accounts: UserSession[]): void {
    localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
  }

  /**
   * Vérifie si une session est déjà enregistrée localement
   */
  checkSession(): UserSession | null {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as UserSession;
    } catch {
      return null;
    }
  }

  /**
   * Inscription d'un nouvel utilisateur (signUp)
   */
  async signUp(credentials: Required<Credentials>): Promise<UserSession> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const accounts = this.getAccounts();
        const exists = accounts.some((a) => a.email.toLowerCase() === credentials.email.toLowerCase());
        if (exists) {
          reject(new Error('Un compte existe déjà avec cette adresse e-mail.'));
          return;
        }

        const newUser: UserSession = {
          uid: `usr_${Math.random().toString(36).slice(2, 9)}`,
          email: credentials.email,
          emailVerified: false, // Doit vérifier son email via le lien
          accessToken: `jwt_${Math.random().toString(36).slice(2)}`,
          displayName: credentials.email.split('@')[0],
          createdAt: new Date().toISOString(),
        };

        accounts.push(newUser);
        this.saveAccounts(accounts);

        // Simulation de l'envoi d'e-mail avec un lien SMTP Google / Firebase
        console.log(`[Google SMTP] E-mail de confirmation envoyé à ${credentials.email} !`);

        resolve(newUser);
      }, 800);
    });
  }

  /**
   * Connexion (signIn)
   */
  async signIn(credentials: Required<Credentials>): Promise<UserSession> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const accounts = this.getAccounts();
        const found = accounts.find((a) => a.email.toLowerCase() === credentials.email.toLowerCase());

        if (!found) {
          reject(new Error('Aucun compte trouvé avec cet e-mail. Veuillez vous inscrire.'));
          return;
        }

        // Connexion réussie, sauvegarde dans le LocalStorage pour persistance de session
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(found));
        resolve(found);
      }, 600);
    });
  }

  /**
   * Simuler la vérification e-mail (pour que l'utilisateur puisse débloquer l'application)
   */
  async verifyEmail(email: string): Promise<UserSession> {
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        const accounts = this.getAccounts();
        const idx = accounts.findIndex((a) => a.email.toLowerCase() === email.toLowerCase());
        if (idx === -1) {
          reject(new Error('Utilisateur non trouvé.'));
          return;
        }

        accounts[idx].emailVerified = true;
        this.saveAccounts(accounts);

        // Met à jour la session active s'il s'agit de l'utilisateur connecté
        const currentSession = this.checkSession();
        if (currentSession && currentSession.email.toLowerCase() === email.toLowerCase()) {
          currentSession.emailVerified = true;
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(currentSession));
        }

        resolve(accounts[idx]);
      }, 500);
    });
  }

  /**
   * Déconnexion (signOut)
   */
  async signOut(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        // On purge également l'état global StateStore
        StateStore.patch({
          workflows: [],
          notes: [],
          tasks: [],
          todoLists: [],
          events: [],
          activities: [],
          captures: []
        });
        resolve();
      }, 400);
    });
  }
}

export const AuthService = new AuthServiceImpl();
export default AuthService;
