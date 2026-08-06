/**
 * FlowMind — UserProfileModal
 * Modale d'affichage et d'édition des informations du profil utilisateur
 * Équipe MILMA Entreprise
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ProfileService } from '../../../core/ProfileService';
import { UserProfile } from '../../../core/Types';
import ChangePasswordForm from './ChangePasswordForm';
import { X, User, Briefcase, Camera, Mail, Calendar, ShieldCheck, Check, Save } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const UserProfileModal: React.FC<Props> = ({ open, onClose }) => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open && user) {
      setLoading(true);
      ProfileService.fetchProfile(user.uid, user.email)
        .then((res) => {
          setProfile(res);
          setFullName(res.fullName);
          setRole(res.role);
          setAvatarUrl(res.avatarUrl || '');
        })
        .finally(() => setLoading(false));
    }
  }, [open, user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setSaving(true);
    setSuccess(false);

    try {
      const updated = await ProfileService.updateProfile(user.uid, {
        fullName,
        role,
        avatarUrl,
      });
      setProfile(updated);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!open || !user) return null;

  // Calculer les initiales pour l'avatar par défaut
  const initials = fullName
    ? fullName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email.slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-2xl rounded-2xl border border-white/[0.1] bg-[#0e1018] shadow-2xl overflow-hidden flex flex-col md:flex-row h-[min(90vh,600px)]">

        {/* Colonne Gauche — Aperçu profil public */}
        <div className="w-full md:w-2/5 border-b md:border-b-0 md:border-r border-white/[0.06] bg-white/[0.01] p-6 flex flex-col items-center justify-center text-center">
          <div className="relative group mb-4">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={fullName}
                className="w-24 h-24 rounded-full object-cover border-2 border-indigo-500/30"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold border-2 border-indigo-500/30 shadow-lg">
                {initials}
              </div>
            )}
            <div className="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
              <Camera className="w-5 h-5 text-white" />
            </div>
          </div>

          <h3 className="text-base font-semibold text-zinc-100 truncate w-full">{fullName || 'Utilisateur'}</h3>
          <p className="text-xs text-indigo-400 mt-1 truncate w-full">{role || 'Rôle non défini'}</p>

          <div className="w-full border-t border-white/[0.06] my-5" />

          {/* Métadonnées du compte */}
          <div className="w-full space-y-3.5 text-left text-xs text-zinc-500">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 shrink-0 text-zinc-600" />
              <span className="truncate flex-1">{user.email}</span>
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Compte Vérifié</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 shrink-0 text-zinc-600" />
              <span>Inscrit le {new Date(user.createdAt).toLocaleDateString('fr-FR')}</span>
            </div>
          </div>
        </div>

        {/* Colonne Droite — Formulaire Édition */}
        <div className="flex-1 p-6 overflow-y-auto flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Éditer le Profil</h2>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-xs">
              Chargement des informations...
            </div>
          ) : (
            <div className="space-y-6 flex-1">
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1.5 uppercase">Nom complet</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-600">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                      placeholder="Votre nom"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1.5 uppercase">Rôle / Filière</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-zinc-600">
                      <Briefcase className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl pl-9 pr-4 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                      placeholder="Votre filière ou profession"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1.5 uppercase">URL de l'avatar</label>
                  <input
                    type="url"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    className="w-full bg-white/[0.02] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50"
                    placeholder="https://exemple.com/avatar.png"
                  />
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-semibold text-xs transition-all shadow-lg"
                >
                  {success ? (
                    <>
                      <Check className="w-4 h-4" /> Enregistré !
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" /> Sauvegarder les modifications
                    </>
                  )}
                </button>
              </form>

              <div className="border-t border-white/[0.06] my-6" />

              {/* Formulaire Mot de passe */}
              <ChangePasswordForm />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserProfileModal;
