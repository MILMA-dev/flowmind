/**
 * FlowMind — AuthContext
 * Contexte React pour l'état de session utilisateur
 * Équipe MILMA Entreprise
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { AuthState, Credentials, UserSession } from '../../core/Types';
import { AuthService } from '../../core/AuthService';

interface AuthContextType extends AuthState {
  signUp: (credentials: Required<Credentials>) => Promise<void>;
  signIn: (credentials: Required<Credentials>) => Promise<void>;
  signOut: () => Promise<void>;
  verifyEmail: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const session = AuthService.checkSession();
    setState({
      user: session,
      loading: false,
      error: null,
    });
  }, []);

  const signUp = async (credentials: Required<Credentials>) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const user = await AuthService.signUp(credentials);
      setState({
        user,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: (err as Error).message,
      }));
      throw err;
    }
  };

  const signIn = async (credentials: Required<Credentials>) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const user = await AuthService.signIn(credentials);
      setState({
        user,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: (err as Error).message,
      }));
      throw err;
    }
  };

  const verifyEmail = async (email: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const updatedUser = await AuthService.verifyEmail(email);
      setState({
        user: updatedUser,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: (err as Error).message,
      }));
      throw err;
    }
  };

  const signOut = async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      await AuthService.signOut();
      setState({
        user: null,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: (err as Error).message,
      }));
    }
  };

  return (
    <AuthContext.Provider value={{ ...state, signUp, signIn, signOut, verifyEmail }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé au sein d\'un AuthProvider');
  }
  return context;
};
