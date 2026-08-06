/**
 * FlowMind — AuthModal
 * Modale d'authentification complète avec formulaires d'inscription et connexion
 * Équipe MILMA Entreprise
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { Mail, Lock, User, ShieldCheck, AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<Props> = ({ open, onClose }) => {
  const { signUp, signIn, verifyEmail, error, loading, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    if (!email || !password) {
      setLocalError('Veuillez remplir tous les champs requis.');
      return;
    }

    if (password.length < 6) {
      setLocalError('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    try {
      if (activeTab === 'register') {
        await signUp({ email, password });
        setRegisteredEmail(email);
      } else {
        await signIn({ email, password });
        onClose();
      }
    } catch (err) {
      // Les erreurs d'API ou simulées sont gérées via le contexte ou le catch
    }
  };

  const handleSimulateVerification = async () => {
    if (registeredEmail) {
      await verifyEmail(registeredEmail);
      setRegisteredEmail(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Container */}
      <div className="relative w-full max-w-md rounded-2xl border border-white/[0.1] bg-[#0e1018] shadow-2xl overflow-hidden p-6 text-zinc-100">

        {registeredEmail ? (
          // Écran post-inscription avec demande de vérification
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-indigo-500/10 border border-indigo-500/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold text-zinc-100 mb-2">Inscription Réussie !</h3>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              Un e-mail de confirmation a été simulé et envoyé à <strong className="text-zinc-200">{registeredEmail}</strong>.
              Veuillez confirmer votre adresse e-mail pour accéder à FlowMind.
            </p>

            <div className="space-y-3">
              <button
                type="button"
                onClick={handleSimulateVerification}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-600 transition-colors text-sm font-semibold shadow-lg text-white"
              >
                Confirmer l'e-mail (Simulation Google SMTP)
              </button>

              <button
                type="button"
                onClick={() => {
                  setRegisteredEmail(null);
                  setActiveTab('login');
                }}
                className="w-full py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] text-zinc-400 transition-colors text-xs"
              >
                Retour à la connexion
              </button>
            </div>
          </div>
        ) : (
          // Onglets Login / Register
          <>
            <div className="flex border-b border-white/[0.06] mb-6">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('login');
                  setLocalError(null);
                }}
                className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-all ${
                  activeTab === 'login'
                    ? 'border-indigo-500 text-indigo-300'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                Se connecter
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('register');
                  setLocalError(null);
                }}
                className={`flex-1 pb-3 text-sm font-semibold border-b-2 transition-all ${
                  activeTab === 'register'
                    ? 'border-indigo-500 text-indigo-300'
                    : 'border-transparent text-zinc-500 hover:text-zinc-300'
                }`}
              >
                S'inscrire
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
                  Adresse e-mail
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-500">
                    <Mail className="w-4 h-4" />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nom@exemple.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">
                  Mot de passe
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-zinc-500">
                    <Lock className="w-4 h-4" />
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50"
                  />
                </div>
              </div>

              {(localError || error) && (
                <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{localError || error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-500 text-white font-semibold text-sm hover:bg-indigo-600 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Traitement en cours...
                  </>
                ) : activeTab === 'login' ? (
                  'Se connecter à FlowMind'
                ) : (
                  'Créer un compte'
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default AuthModal;
