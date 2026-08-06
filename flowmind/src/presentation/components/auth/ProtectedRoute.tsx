/**
 * FlowMind — ProtectedRoute
 * Routeur de protection pour empêcher l'accès au canvas FlowMind sans authentification/vérification
 * Équipe MILMA Entreprise
 */

import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import AuthModal from './AuthModal';
import { ShieldAlert, LogOut } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const { user, loading, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(true);

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#07080c] text-zinc-400">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-500"></div>
      </div>
    );
  }

  // Si pas connecté du tout, afficher la modale d'authentification
  if (!user) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#07080c] px-4">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-semibold text-zinc-200 mb-2">Authentification Requise</h2>
          <p className="text-sm text-zinc-500 mb-6">
            Veuillez vous inscrire ou vous connecter pour accéder à votre espace de travail FlowMind.
          </p>
          <button
            onClick={() => setAuthOpen(true)}
            className="px-5 py-2.5 rounded-xl bg-indigo-500 text-white font-medium text-sm hover:bg-indigo-600 transition-colors shadow-lg"
          >
            Se Connecter / S'inscrire
          </button>
        </div>
        <AuthModal open={authOpen} onClose={() => {}} />
      </div>
    );
  }

  // Si connecté mais e-mail non vérifié, bloquer l'accès avec un écran de vérification
  if (!user.emailVerified) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#07080c] px-4">
        <div className="w-full max-w-md p-6 rounded-2xl border border-amber-500/20 bg-amber-500/5 shadow-2xl text-center">
          <ShieldAlert className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-amber-200 mb-2">Vérification de l'E-mail Requise</h2>
          <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
            Un e-mail de confirmation a été envoyé à <strong className="text-zinc-200">{user.email}</strong>.
            Veuillez cliquer sur le lien de confirmation reçu avant de pouvoir accéder à l'application.
          </p>

          <div className="space-y-3">
            <button
              onClick={() => {
                // Simuler la confirmation de l'e-mail (bouton de validation d'e-mail reçu pour test ou démo)
                window.location.reload();
              }}
              className="w-full py-2.5 rounded-xl bg-amber-500/20 text-amber-200 border border-amber-500/30 hover:bg-amber-500/30 transition-colors text-sm font-medium"
            >
              J'ai vérifié mon adresse e-mail (Rafraîchir)
            </button>

            <button
              onClick={() => signOut()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.02] text-zinc-400 hover:bg-white/[0.05] transition-colors text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              Se déconnecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
