/**
 * AuthContext — État d'authentification global FlowMind
 * Équipe MILMA Entreprise
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AuthService } from '../../core/AuthService';
import { EventBus } from '../../core/EventBus';
import { ProfileSyncEngine } from '../../core/services/ProfileSyncEngine';
import { HybridStorageAdapter } from '../../core/storage/HybridStorageAdapter';
import { ProfileService } from '../../core/ProfileService';
import {
  AppEvents,
  type AuthCredentials,
  type AuthResult,
  type AuthState,
  type AuthStatus,
  type AuthUser,
  type UserSession,
} from '../../core/Types';

interface AuthContextValue extends AuthState {
  signIn: (c: AuthCredentials) => Promise<AuthResult>;
  signUp: (c: AuthCredentials) => Promise<AuthResult>;
  signOut: () => Promise<void>;
  resendVerification: (email: string) => Promise<AuthResult>;
  verifyEmail: (token: string) => Promise<AuthResult>;
  /** Dernier token de vérif (simulation SMTP locale) */
  lastVerificationToken: string | null;
  lastVerificationEmail: string | null;
  clearVerificationHint: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function deriveStatus(
  session: UserSession | null,
  loading: boolean
): AuthStatus {
  if (loading) return 'loading';
  if (!session) return 'unauthenticated';
  return 'authenticated';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastVerificationToken, setLastVerificationToken] = useState<
    string | null
  >(null);
  const [lastVerificationEmail, setLastVerificationEmail] = useState<
    string | null
  >(null);

  const applySession = useCallback((s: UserSession | null) => {
    setSession(s);
  }, []);

  const refresh = useCallback(async () => {
    const s = await AuthService.checkSession();
    applySession(s);
  }, [applySession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Lien e-mail d'abord (legacy)
      const verified = await AuthService.consumeVerifyFromUrl();
      if (verified?.ok && verified.session) {
        if (!cancelled) {
          applySession(verified.session);
          setLastVerificationToken(null);
          ProfileSyncEngine.start(verified.session.user.id);
          // Seed hybrid cache from auth user
          const prof = ProfileService.fetchProfile(verified.session.user.id);
          if (prof) void HybridStorageAdapter.saveUserProfile(prof);
          setLoading(false);
        }
        return;
      }
      const s = await AuthService.checkSession();
      if (!cancelled) {
        applySession(s);
        if (s?.user?.id) {
          ProfileSyncEngine.start(s.user.id);
          const prof = ProfileService.fetchProfile(s.user.id);
          if (prof) {
            // Fast path: ensure local hybrid cache exists then background reconcile
            const existing = HybridStorageAdapter.getUserProfileFast(s.user.id);
            if (!existing) {
              void HybridStorageAdapter.saveUserProfile(prof);
            } else {
              void HybridStorageAdapter.getUserProfile(s.user.id);
            }
          }
          void ProfileSyncEngine.syncOnLogin(s.user.id);
        }
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applySession]);

  useEffect(() => {
    const unsubs = [
      EventBus.subscribe(AppEvents.AUTH_SIGNED_IN, (payload) => {
        const p = payload as { session?: UserSession };
        if (p?.session) {
          applySession(p.session);
          ProfileSyncEngine.setUser(p.session.user.id);
          void ProfileSyncEngine.syncOnLogin(p.session.user.id);
        }
        setError(null);
      }),
      EventBus.subscribe(AppEvents.AUTH_SIGNED_OUT, () => {
        applySession(null);
        ProfileSyncEngine.setUser(null);
      }),
      EventBus.subscribe(AppEvents.AUTH_EMAIL_VERIFIED, () => {
        setLastVerificationToken(null);
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, [applySession]);

  // Cleanup engine on unmount
  useEffect(() => {
    return () => ProfileSyncEngine.stop();
  }, []);

  const signIn = useCallback(async (c: AuthCredentials) => {
    setError(null);
    const res = await AuthService.signIn(c);
    if (res.ok && res.session) {
      applySession(res.session);
      setLastVerificationToken(null);
      setLastVerificationEmail(null);
    } else {
      setError(res.error ?? 'Connexion impossible');
    }
    return res;
  }, [applySession]);

  const signUp = useCallback(async (c: AuthCredentials) => {
    setError(null);
    const res = await AuthService.signUp(c);
    if (res.ok && res.session) {
      applySession(res.session);
      setLastVerificationToken(null);
      setLastVerificationEmail(null);
      setError(null);
    } else if (!res.ok) {
      setError(res.error ?? 'Inscription impossible');
    }
    return res;
  }, [applySession]);

  const signOut = useCallback(async () => {
    await AuthService.signOut();
    applySession(null);
    setLastVerificationToken(null);
    setLastVerificationEmail(null);
  }, [applySession]);

  const resendVerification = useCallback(async (email: string) => {
    const res = await AuthService.resendVerification(email);
    if (res.verificationToken) {
      setLastVerificationToken(res.verificationToken);
      setLastVerificationEmail(email.trim().toLowerCase());
    }
    if (!res.ok) setError(res.error ?? null);
    return res;
  }, []);

  const verifyEmail = useCallback(
    async (token: string) => {
      const res = await AuthService.verifyEmail(token);
      if (res.ok && res.session) {
        applySession(res.session);
        setLastVerificationToken(null);
        setError(null);
      } else {
        setError(res.error ?? 'Vérification échouée');
      }
      return res;
    },
    [applySession]
  );

  const clearVerificationHint = useCallback(() => {
    setLastVerificationToken(null);
  }, []);

  const status = deriveStatus(session, loading);
  const user: AuthUser | null = session?.user ?? null;

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      user,
      error,
      requiresEmailVerification: false,
      signIn,
      signUp,
      signOut,
      resendVerification,
      verifyEmail,
      lastVerificationToken,
      lastVerificationEmail,
      clearVerificationHint,
      refresh,
    }),
    [
      status,
      session,
      user,
      error,
      lastVerificationToken,
      lastVerificationEmail,
      signIn,
      signUp,
      signOut,
      resendVerification,
      verifyEmail,
      clearVerificationHint,
      refresh,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function useAuthOptional(): AuthContextValue | null {
  return useContext(AuthContext);
}
