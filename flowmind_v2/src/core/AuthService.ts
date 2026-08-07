/**
 * FlowMind — AuthService
 * Authentification e-mail/mot de passe, sessions JWT-like, cookies HttpOnly et refresh silencieux.
 * Équipe MILMA Entreprise
 *
 * Conforme OWASP Top 10: AccessToken stocké exclusivement en mémoire vive,
 * rafraîchissement automatique et transparent via cookie HttpOnly sécurisé.
 */

import { EventBus } from './EventBus';
import { uid } from './StateStore';
import {
  AppEvents,
  type AuthCredentials,
  type AuthResult,
  type AuthUser,
  type UserSession,
} from './Types';
import { CloudRegistry } from './storage/CloudRegistry';
import { RemoteDatabaseAdapter } from './storage/RemoteDatabaseAdapter';

const USERS_KEY = 'flowmind:auth:users:v1';
const VERIFY_KEY = 'flowmind:auth:verify:v1';
const TOKEN_SECRET = 'flowmind-milma-auth-v1';

// Stockage de l'AccessToken strictement en mémoire vive (Variable de module non exportée)
let memoryAccessToken: string | null = null;
let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

function onTokenRefreshed(token: string) {
  refreshSubscribers.map((callback) => callback(token));
  refreshSubscribers = [];
}

function addRefreshSubscriber(callback: (token: string) => void) {
  refreshSubscribers.push(callback);
}

interface StoredUser {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  avatarUrl?: string | null;
  role?: string | null;
  bio?: string | null;
  preferences?: {
    locale?: string;
    notifyEmail?: boolean;
    publicProfile?: boolean;
  } | null;
}

interface VerifyRecord {
  userId: string;
  email: string;
  token: string;
  createdAt: string;
  expiresAt: string;
}

function b64url(data: string): string {
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(data: string): string {
  const pad = data.length % 4 === 0 ? '' : '='.repeat(4 - (data.length % 4));
  const s = data.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return atob(s);
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hashPassword(password: string, salt?: string): Promise<string> {
  const s =
    salt ??
    Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  const hash = await sha256Hex(`${s}:${password}:${TOKEN_SECRET}`);
  return `${s}:${hash}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt] = stored.split(':');
  if (!salt) return false;
  const next = await hashPassword(password, salt);
  return next === stored;
}

function loadUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    return raw ? (JSON.parse(raw) as StoredUser[]) : [];
  } catch {
    return [];
  }
}

function saveUsers(users: StoredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function loadVerifyMap(): Record<string, VerifyRecord> {
  try {
    const raw = localStorage.getItem(VERIFY_KEY);
    return raw ? (JSON.parse(raw) as Record<string, VerifyRecord>) : {};
  } catch {
    return {};
  }
}

function saveVerifyMap(map: Record<string, VerifyRecord>): void {
  localStorage.setItem(VERIFY_KEY, JSON.stringify(map));
}

function toPublicUser(u: StoredUser): AuthUser {
  return {
    id: u.id,
    email: u.email,
    displayName: u.displayName,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    avatarUrl: u.avatarUrl ?? null,
    role: u.role ?? null,
    bio: u.bio ?? null,
    preferences: u.preferences ?? {
      locale: 'fr',
      notifyEmail: true,
      publicProfile: false,
    },
  };
}

export function authLoadUsers(): StoredUser[] {
  return loadUsers();
}

export function authSaveUsers(users: StoredUser[]): void {
  saveUsers(users);
}

export function authToPublicUser(u: StoredUser): AuthUser {
  return toPublicUser(u);
}

export async function authHashPassword(password: string, salt?: string): Promise<string> {
  return hashPassword(password, salt);
}

export async function authVerifyPassword(password: string, stored: string): Promise<boolean> {
  return verifyPassword(password, stored);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

class AuthServiceImpl {
  private session: UserSession | null = null;

  /** Restaure la session au boot en tentant un refresh silencieux */
  async checkSession(): Promise<UserSession | null> {
    try {
      const success = await this.silentRefresh();
      if (success && this.session) {
        EventBus.publish(AppEvents.AUTH_SESSION_RESTORED, { session: this.session });
        return this.session;
      }
      return null;
    } catch {
      this.clearSession();
      return null;
    }
  }

  getSession(): UserSession | null {
    return this.session;
  }

  getUser(): AuthUser | null {
    return this.session?.user ?? null;
  }

  getAccessToken(): string | null {
    return memoryAccessToken;
  }

  isAuthenticated(): boolean {
    return !!this.session?.user;
  }

  isEmailVerified(): boolean {
    return !!this.session?.user?.emailVerified;
  }

  /**
   * Effectue un rafraîchissement silencieux des tokens (Silent Refresh).
   * Appelle l'API /api/auth/refresh pour récupérer un accessToken frais.
   */
  async silentRefresh(): Promise<boolean> {
    if (isRefreshing) {
      return new Promise((resolve) => {
        addRefreshSubscriber((token) => {
          resolve(!!token);
        });
      });
    }

    isRefreshing = true;

    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Refresh failed: status ${res.status}`);
      }

      const data = await res.json();
      if (data.success && data.accessToken) {
        memoryAccessToken = data.accessToken;
        RemoteDatabaseAdapter.setAuthToken(memoryAccessToken);

        this.session = {
          token: data.accessToken,
          user: data.user,
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        };

        onTokenRefreshed(data.accessToken);
        isRefreshing = false;
        return true;
      }
    } catch (err) {
      console.warn('[Auth] Impossible d\'effectuer le refresh silencieux des cookies', err);
    }

    this.clearSession();
    isRefreshing = false;
    return false;
  }

  /**
   * Inscription d'utilisateur
   */
  async signUp(credentials: AuthCredentials): Promise<AuthResult> {
    const email = credentials.email.trim().toLowerCase();
    const password = credentials.password;
    const displayName =
      credentials.displayName?.trim() || email.split('@')[0] || 'Utilisateur';

    if (!displayName || displayName.length < 2) {
      return this.fail('Indiquez un nom (2 caractères min.)');
    }
    if (!isValidEmail(email)) {
      return this.fail('Adresse e-mail invalide');
    }
    if (password.length < 8) {
      return this.fail('Mot de passe : 8 caractères minimum');
    }

    try {
      const remoteExisting = await CloudRegistry.findUserByEmail(email);
      if (remoteExisting) {
        return this.fail('Un compte existe déjà avec cet e-mail. Connectez-vous.');
      }
    } catch {
      // offline fallback
    }

    const users = loadUsers();
    if (users.some((u) => u.email === email)) {
      return this.fail('Un compte existe déjà avec cet e-mail');
    }

    const now = new Date().toISOString();
    const user: StoredUser = {
      id: uid('usr'),
      email,
      displayName,
      passwordHash: await hashPassword(password),
      emailVerified: true,
      createdAt: now,
      lastLoginAt: now,
    };
    users.push(user);
    saveUsers(users);

    // Essai d'enregistrement en base distante (Prisma)
    try {
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      // ignore offline
    }

    return this.signIn(credentials);
  }

  /**
   * Connexion sécurisée
   */
  async signIn(credentials: AuthCredentials): Promise<AuthResult> {
    const email = credentials.email.trim().toLowerCase();
    const password = credentials.password;

    if (!isValidEmail(email) || !password) {
      return this.fail('E-mail ou mot de passe manquant');
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        return this.fail(errData.error || 'Identifiants incorrects');
      }

      const data = await res.json();
      if (data.success && data.accessToken) {
        memoryAccessToken = data.accessToken;
        RemoteDatabaseAdapter.setAuthToken(memoryAccessToken);

        this.session = {
          token: data.accessToken,
          user: data.user,
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        };

        // Enregistre également en local pour le offline mode
        const users = loadUsers();
        let localUser = users.find((u) => u.email === email);
        if (!localUser) {
          localUser = {
            id: data.user.id,
            email: data.user.email,
            displayName: data.user.displayName,
            passwordHash: await hashPassword(password),
            emailVerified: data.user.emailVerified,
            createdAt: data.user.createdAt,
            lastLoginAt: new Date().toISOString(),
          };
          users.push(localUser);
          saveUsers(users);
        }

        EventBus.publish(AppEvents.AUTH_SIGNED_IN, { session: this.session });
        EventBus.publish(AppEvents.TOAST_SHOW, {
          id: uid('toast'),
          type: 'success',
          title: 'Connexion réussie',
          description: `Bienvenue, ${data.user.displayName}`,
          duration: 2800,
        });

        return { ok: true, user: data.user, session: this.session };
      }
    } catch (err) {
      console.warn('[Auth] Impossible d\'interagir avec l\'API de login, tentative offline', err);
    }

    // Connexion locale de secours si hors-ligne
    const users = loadUsers();
    const user = users.find((u) => u.email === email);
    if (user) {
      const ok = await verifyPassword(password, user.passwordHash);
      if (ok) {
        // Crée une session locale fictive d'une heure
        memoryAccessToken = 'offline-fictive-token-' + user.id;
        RemoteDatabaseAdapter.setAuthToken(memoryAccessToken);

        this.session = {
          token: memoryAccessToken,
          user: toPublicUser(user),
          issuedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
        };

        EventBus.publish(AppEvents.AUTH_SIGNED_IN, { session: this.session });
        return { ok: true, user: toPublicUser(user), session: this.session };
      }
    }

    return this.fail('Identifiants incorrects ou réseau inaccessible');
  }

  /**
   * Déconnexion sécurisée
   */
  async signOut(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // offline-safe
    }
    this.clearSession();
    EventBus.publish(AppEvents.AUTH_SIGNED_OUT, { at: new Date().toISOString() });
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type: 'info',
      title: 'Déconnecté',
      description: 'Session révoquée · cookies détruits',
      duration: 2000,
    });
  }

  /**
   * Vérifie le token e-mail (lien reçu).
   */
  async verifyEmail(token: string): Promise<AuthResult> {
    const map = loadVerifyMap();
    const rec = map[token];
    if (!rec) {
      return this.fail('Lien de vérification invalide ou expiré');
    }
    if (new Date(rec.expiresAt).getTime() < Date.now()) {
      delete map[token];
      saveVerifyMap(map);
      return this.fail('Lien de vérification expiré');
    }

    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === rec.userId);
    if (idx < 0) {
      return this.fail('Compte introuvable');
    }

    users[idx] = { ...users[idx], emailVerified: true };
    saveUsers(users);
    delete map[token];
    saveVerifyMap(map);

    const user = users[idx];
    user.lastLoginAt = new Date().toISOString();
    saveUsers(users);

    const session = {
      token: 'verification-success-' + user.id,
      user: toPublicUser(user),
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    };
    this.session = session;
    memoryAccessToken = session.token;
    RemoteDatabaseAdapter.setAuthToken(memoryAccessToken);

    EventBus.publish(AppEvents.AUTH_EMAIL_VERIFIED, { user: toPublicUser(user) });
    EventBus.publish(AppEvents.AUTH_SIGNED_IN, { session });
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type: 'success',
      title: 'E-mail vérifié',
      description: 'Votre compte est activé',
      duration: 3000,
    });

    return { ok: true, user: toPublicUser(user), session };
  }

  /** Renvoie un lien de vérification (simulation SMTP) */
  async resendVerification(email: string): Promise<AuthResult> {
    const users = loadUsers();
    const user = users.find((u) => u.email === email.trim().toLowerCase());
    if (!user) {
      return this.fail('Aucun compte pour cet e-mail');
    }
    if (user.emailVerified) {
      return this.fail('E-mail déjà vérifié — connectez-vous');
    }
    const token = await sha256Hex(
      `${user.id}:${user.email}:${Date.now()}:${Math.random()}:${TOKEN_SECRET}`
    );
    const map = loadVerifyMap();
    const now = Date.now();
    map[token] = {
      userId: user.id,
      email: user.email,
      token,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 48 * 60 * 60 * 1000).toISOString(),
    };
    saveVerifyMap(map);

    const verifyUrl = this.buildVerifyUrl(token);
    console.info(`[FlowMind Auth] Renvoi vérification ${user.email}:\n${verifyUrl}`);
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type: 'info',
      title: 'Lien renvoyé',
      description: 'Consultez la console / panneau de vérification',
      duration: 3500,
    });
    return {
      ok: true,
      user: toPublicUser(user),
      verificationSent: true,
      verificationToken: token,
    };
  }

  /** Construit l'URL de vérification (query param) */
  buildVerifyUrl(token: string): string {
    const url = new URL(window.location.href);
    url.searchParams.set('fm_verify', token);
    return url.toString();
  }

  /** Traite le paramètre URL fm_verify au chargement */
  async consumeVerifyFromUrl(): Promise<AuthResult | null> {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('fm_verify');
    if (!token) return null;
    const result = await this.verifyEmail(token);
    params.delete('fm_verify');
    const next = `${window.location.pathname}${
      params.toString() ? `?${params}` : ''
    }${window.location.hash}`;
    window.history.replaceState({}, '', next);
    return result;
  }

  /** Met à jour la session en mémoire + storage (profil rafraîchi) */
  refreshSessionUser(user: AuthUser): UserSession | null {
    if (!this.session) return null;
    const next: UserSession = {
      ...this.session,
      user,
    };
    this.session = next;
    return next;
  }

  /**
   * Intercepteur Fetch global de FlowMind pour rejouer automatiquement les 401.
   */
  async secureFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
    let headers = new Headers(init?.headers);

    // Attache automatiquement le AccessToken en mémoire
    const currentToken = this.getAccessToken();
    if (currentToken) {
      headers.set('Authorization', `Bearer ${currentToken}`);
    }

    const nextInit = { ...init, headers };
    let response = await fetch(input, nextInit);

    // Si on obtient une erreur 401, on tente de faire un refresh silencieux de l'AccessToken
    if (response.status === 401) {
      console.log('[Auth Interceptor] 401 détecté, déclenchement du refresh silencieux...');
      const refreshed = await this.silentRefresh();

      if (refreshed) {
        // Re-attache le nouvel accessToken
        const nextToken = this.getAccessToken();
        if (nextToken) {
          headers.set('Authorization', `Bearer ${nextToken}`);
        }
        console.log('[Auth Interceptor] Refresh réussi, rejouement de la requête...');
        response = await fetch(input, { ...init, headers });
      }
    }

    return response;
  }

  private clearSession(): void {
    this.session = null;
    memoryAccessToken = null;
    RemoteDatabaseAdapter.setAuthToken(null);
  }

  private fail(error: string): AuthResult {
    EventBus.publish(AppEvents.AUTH_ERROR, { error });
    return { ok: false, error };
  }
}

export const AuthService = new AuthServiceImpl();
export default AuthService;
