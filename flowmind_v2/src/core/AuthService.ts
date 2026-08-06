/**
 * FlowMind — AuthService
 * Authentification e-mail/mot de passe, sessions JWT-like, vérification e-mail
 * Équipe MILMA Entreprise
 *
 * Stockage local sécurisé (hash SHA-256 + jeton signé).
 * Architecture compatible migration Supabase/Firebase Auth.
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
import { CloudRegistry, type CloudUserRecord } from './storage/CloudRegistry';

const USERS_KEY = 'flowmind:auth:users:v1';
const SESSION_KEY = 'flowmind:auth:session:v1';
const VERIFY_KEY = 'flowmind:auth:verify:v1';
/** Secret applicatif pour signature des jetons (local) */
const TOKEN_SECRET = 'flowmind-milma-auth-v1';
/** Durée de session : 30 jours */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface StoredUser {
  id: string;
  email: string;
  displayName: string;
  /** salt:hash hex */
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

/** Accès interne pour ProfileService */
export function authLoadUsers(): StoredUser[] {
  return loadUsers();
}

export function authSaveUsers(users: StoredUser[]): void {
  saveUsers(users);
}

export function authToPublicUser(u: StoredUser): AuthUser {
  return toPublicUser(u);
}

export async function authHashPassword(
  password: string,
  salt?: string
): Promise<string> {
  return hashPassword(password, salt);
}

export async function authVerifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  return verifyPassword(password, stored);
}

export type { StoredUser };

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

class AuthServiceImpl {
  private session: UserSession | null = null;

  /** Restaure la session au boot */
  async checkSession(): Promise<UserSession | null> {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) {
        this.session = null;
        return null;
      }
      const session = JSON.parse(raw) as UserSession;
      if (!session?.token || !session.user) {
        this.clearSession();
        return null;
      }
      // Expiration
      if (new Date(session.expiresAt).getTime() < Date.now()) {
        this.clearSession();
        return null;
      }
      // Vérifie signature du jeton
      const valid = await this.verifyToken(session.token, session.user.id);
      if (!valid) {
        this.clearSession();
        return null;
      }
      // Sync user frais depuis store local, sinon cloud
      const users = loadUsers();
      let stored = users.find((u) => u.id === session.user.id);
      if (!stored) {
        // Tente de re-télécharger le profil cloud (nouvel appareil avec session?)
        try {
          const remote = await CloudRegistry.findUserById(session.user.id);
          if (remote) {
            stored = this.cloudToStored(remote);
            this.upsertLocalUser(stored);
          }
        } catch {
          /* offline */
        }
      }
      if (!stored) {
        this.clearSession();
        return null;
      }
      session.user = toPublicUser(stored);
      this.session = session;
      this.persistSession(session);
      EventBus.publish(AppEvents.AUTH_SESSION_RESTORED, { session });
      return session;
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

  isAuthenticated(): boolean {
    return !!this.session?.user;
  }

  isEmailVerified(): boolean {
    return !!this.session?.user?.emailVerified;
  }

  /**
   * Inscription : nom + e-mail + mot de passe.
   * Écrit en local ET dans le registre cloud partagé (multi-appareils).
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

    // Vérifie d'abord le cloud (compte déjà créé sur un autre appareil)
    try {
      const remoteExisting = await CloudRegistry.findUserByEmail(email);
      if (remoteExisting) {
        return this.fail(
          'Un compte existe déjà avec cet e-mail (cloud). Connectez-vous.'
        );
      }
    } catch {
      /* offline : on continue en local */
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

    // Push cloud — retry (critique multi-appareils)
    let cloudOk = false;
    let cloudErr = '';
    for (let attempt = 0; attempt < 3 && !cloudOk; attempt++) {
      try {
        await CloudRegistry.upsertUser(this.storedToCloud(user));
        cloudOk = true;
      } catch (err) {
        cloudErr = String((err as Error)?.message || err);
        console.warn(`[Auth] Inscription cloud tentative ${attempt + 1}`, err);
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }

    if (!cloudOk && navigator.onLine) {
      // Rollback local pour éviter comptes fantômes non partageables
      const filtered = loadUsers().filter((u) => u.id !== user.id);
      saveUsers(filtered);
      return this.fail(
        `Impossible d'enregistrer le compte dans le cloud (${cloudErr || 'réseau'}). Réessayez.`
      );
    }

    const session = await this.createSession(user);
    this.session = session;
    this.persistSession(session);

    EventBus.publish(AppEvents.AUTH_SIGNED_UP, {
      user: toPublicUser(user),
      cloudSynced: cloudOk,
    });
    EventBus.publish(AppEvents.AUTH_SIGNED_IN, { session });
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type: cloudOk ? 'success' : 'warning',
      title: 'Compte créé',
      description: cloudOk
        ? `Bienvenue, ${user.displayName} · dispo sur tous vos appareils`
        : `Bienvenue, ${user.displayName} · mode local (hors-ligne)`,
      duration: 3200,
    });

    return {
      ok: true,
      user: toPublicUser(user),
      session,
    };
  }

  /**
   * Connexion : cherche localement puis dans le registre cloud partagé.
   * Sur un nouvel appareil, le compte cloud est téléchargé puis validé.
   */
  async signIn(credentials: AuthCredentials): Promise<AuthResult> {
    const email = credentials.email.trim().toLowerCase();
    const password = credentials.password;

    if (!isValidEmail(email) || !password) {
      return this.fail('E-mail ou mot de passe manquant');
    }

    // 1) Local
    let users = loadUsers();
    let user = users.find((u) => u.email === email) ?? null;

    // 2) Cloud si absent localement (ou pour rafraîchir le hash)
    let fromCloud = false;
    try {
      const remote = await CloudRegistry.findUserByEmail(email);
      if (remote) {
        const remoteAsStored = this.cloudToStored(remote);
        if (!user) {
          user = remoteAsStored;
          this.upsertLocalUser(user);
          fromCloud = true;
        } else {
          // Prefer cloud hash if remote is newer
          const remoteT = new Date(remote.updatedAt || remote.createdAt).getTime();
          const localT = new Date(user.createdAt).getTime();
          if (remoteT >= localT) {
            user = {
              ...user,
              ...remoteAsStored,
              // keep local-only fields if any
            };
            this.upsertLocalUser(user);
            fromCloud = true;
          }
        }
      }
    } catch (err) {
      console.warn('[Auth] Cloud unreachable during signIn', err);
      if (!user) {
        return this.fail(
          'Compte introuvable sur cet appareil et cloud inaccessible. Vérifiez votre connexion.'
        );
      }
    }

    if (!user) {
      return this.fail(
        'Aucun compte avec cet e-mail. Inscrivez-vous d\'abord (sur n\'importe quel appareil connecté).'
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return this.fail('Identifiants incorrects');
    }

    if (!user.emailVerified) {
      user.emailVerified = true;
    }

    user.lastLoginAt = new Date().toISOString();
    this.upsertLocalUser(user);

    // Met à jour lastLogin cloud
    try {
      await CloudRegistry.upsertUser(this.storedToCloud(user));
    } catch {
      /* offline ok */
    }

    const session = await this.createSession(user);
    this.session = session;
    this.persistSession(session);

    EventBus.publish(AppEvents.AUTH_SIGNED_IN, { session, fromCloud });
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type: 'success',
      title: 'Connexion réussie',
      description: fromCloud
        ? `${user.displayName} · compte restauré depuis le cloud`
        : `Bienvenue, ${user.displayName}`,
      duration: 2800,
    });

    return { ok: true, user: toPublicUser(user), session };
  }

  private upsertLocalUser(user: StoredUser): void {
    const users = loadUsers();
    const idx = users.findIndex((u) => u.id === user.id || u.email === user.email);
    if (idx >= 0) users[idx] = user;
    else users.push(user);
    saveUsers(users);
  }

  private storedToCloud(user: StoredUser): CloudUserRecord {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      passwordHash: user.passwordHash,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      avatarUrl: user.avatarUrl ?? null,
      role: user.role ?? null,
      bio: user.bio ?? null,
      preferences: user.preferences ?? null,
      updatedAt: new Date().toISOString(),
    };
  }

  private cloudToStored(remote: CloudUserRecord): StoredUser {
    return {
      id: remote.id,
      email: remote.email,
      displayName: remote.displayName,
      passwordHash: remote.passwordHash,
      emailVerified: remote.emailVerified ?? true,
      createdAt: remote.createdAt,
      lastLoginAt: remote.lastLoginAt,
      avatarUrl: remote.avatarUrl ?? null,
      role: remote.role ?? null,
      bio: remote.bio ?? null,
      preferences: remote.preferences as StoredUser['preferences'],
    };
  }

  /**
   * Déconnexion + purge session.
   * La bascule de scope storage / reset StateStore est gérée par
   * GlobalSyncEngine.deactivate() via SyncProvider (écoute userId).
   */
  async signOut(): Promise<void> {
    this.clearSession();
    EventBus.publish(AppEvents.AUTH_SIGNED_OUT, {
      at: new Date().toISOString(),
    });
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type: 'info',
      title: 'Déconnecté',
      description: 'Session terminée · données du compte isolées',
      duration: 2000,
    });
  }

  /**
   * Vérifie le token e-mail (lien reçu).
   * Peut être appelé depuis ?fm_verify=TOKEN
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
    // Auto-login après vérification
    user.lastLoginAt = new Date().toISOString();
    saveUsers(users);
    const session = await this.createSession(user);
    this.session = session;
    this.persistSession(session);

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
    const verificationToken = await this.createVerificationToken(user);
    const verifyUrl = this.buildVerifyUrl(verificationToken);
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
      verificationToken,
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
    // Nettoie l'URL
    params.delete('fm_verify');
    const next = `${window.location.pathname}${
      params.toString() ? `?${params}` : ''
    }${window.location.hash}`;
    window.history.replaceState({}, '', next);
    return result;
  }

  // ─── Internals ────────────────────────────────────────

  private async createVerificationToken(user: StoredUser): Promise<string> {
    const token = await sha256Hex(
      `${user.id}:${user.email}:${Date.now()}:${Math.random()}:${TOKEN_SECRET}`
    );
    const map = loadVerifyMap();
    // Purge anciens tokens de cet user
    for (const [k, v] of Object.entries(map)) {
      if (v.userId === user.id) delete map[k];
    }
    const now = Date.now();
    map[token] = {
      userId: user.id,
      email: user.email,
      token,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 48 * 60 * 60 * 1000).toISOString(),
    };
    saveVerifyMap(map);
    return token;
  }

  private async createSession(user: StoredUser): Promise<UserSession> {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_MS);
    const payload = {
      sub: user.id,
      email: user.email,
      iat: issuedAt.getTime(),
      exp: expiresAt.getTime(),
    };
    const body = b64url(JSON.stringify(payload));
    const sig = await sha256Hex(`${body}.${TOKEN_SECRET}`);
    const token = `fm1.${body}.${sig.slice(0, 32)}`;

    return {
      token,
      user: toPublicUser(user),
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
  }

  private async verifyToken(token: string, userId: string): Promise<boolean> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3 || parts[0] !== 'fm1') return false;
      const [, body, sig] = parts;
      const expected = (await sha256Hex(`${body}.${TOKEN_SECRET}`)).slice(0, 32);
      if (sig !== expected) return false;
      const payload = JSON.parse(b64urlDecode(body)) as {
        sub: string;
        exp: number;
      };
      if (payload.sub !== userId) return false;
      if (payload.exp < Date.now()) return false;
      return true;
    } catch {
      return false;
    }
  }

  private persistSession(session: UserSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  /** Met à jour la session en mémoire + storage (profil rafraîchi) */
  refreshSessionUser(user: AuthUser): UserSession | null {
    if (!this.session) return null;
    const next: UserSession = {
      ...this.session,
      user,
    };
    this.session = next;
    this.persistSession(next);
    return next;
  }

  private clearSession(): void {
    this.session = null;
    localStorage.removeItem(SESSION_KEY);
  }

  private fail(error: string): AuthResult {
    EventBus.publish(AppEvents.AUTH_ERROR, { error });
    return { ok: false, error };
  }
}

export const AuthService = new AuthServiceImpl();
export default AuthService;
