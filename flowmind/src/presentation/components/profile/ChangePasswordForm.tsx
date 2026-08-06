/**
 * FlowMind — ChangePasswordForm
 * Formulaire de mise à jour sécurisée du mot de passe
 * Équipe MILMA Entreprise
 */

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';

export const ChangePasswordForm: React.FC = () => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (!oldPassword || !newPassword || !confirmPassword) {
      setMessage({ type: 'err', text: 'Veuillez remplir tous les champs de mot de passe.' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'err', text: 'Le nouveau mot de passe doit contenir au moins 6 caractères.' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'err', text: 'Les nouveaux mots de passe ne correspondent pas.' });
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setMessage({ type: 'ok', text: 'Votre mot de passe a été mis à jour avec succès.' });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    }, 800);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Sécurité du compte</h4>

      <div>
        <label className="block text-[11px] font-semibold text-zinc-500 mb-1">Mot de passe actuel</label>
        <div className="relative">
          <input
            type={showOld ? 'text' : 'password'}
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowOld(!showOld)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300"
          >
            {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-zinc-500 mb-1">Nouveau mot de passe</label>
        <div className="relative">
          <input
            type={showNew ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50"
            placeholder="Min. 6 caractères"
          />
          <button
            type="button"
            onClick={() => setShowNew(!showNew)}
            className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300"
          >
            {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-zinc-500 mb-1">Confirmer le nouveau mot de passe</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50"
          placeholder="••••••••"
        />
      </div>

      {message && (
        <div
          className={`flex items-start gap-2 rounded-xl px-3 py-2 text-xs border ${
            message.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200'
              : 'bg-rose-500/10 border-rose-500/25 text-rose-200'
          }`}
        >
          {message.type === 'ok' ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-xl bg-indigo-500/15 text-indigo-300 border border-indigo-500/25 hover:bg-indigo-500/25 transition-all text-xs font-semibold"
      >
        {loading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
      </button>
    </form>
  );
};

export default ChangePasswordForm;
