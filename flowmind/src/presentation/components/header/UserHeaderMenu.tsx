/**
 * FlowMind — UserHeaderMenu
 * Menu dropdown de profil utilisateur situé dans l'en-tête de navigation
 * Équipe MILMA Entreprise
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ProfileService } from '../../../core/ProfileService';
import { UserProfile } from '../../../core/Types';
import UserProfileModal from '../profile/UserProfileModal';
import { User, LogOut, ChevronDown, ShieldCheck, Settings } from 'lucide-react';

export const UserHeaderMenu: React.FC = () => {
  const { user, signOut } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setUserProfileModalOpen] = useState(false);

  useEffect(() => {
    if (user) {
      ProfileService.fetchProfile(user.uid, user.email).then(setProfile);
    }
  }, [user, modalOpen]);

  if (!user) return null;

  // Initiales par défaut
  const displayName = profile?.fullName || user.email.split('@')[0];
  const initials = displayName
    ? displayName.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : user.email.slice(0, 2).toUpperCase();

  const handleSignOut = () => {
    if (confirm('Voulez-vous vous déconnecter de votre session FlowMind ?')) {
      signOut();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center gap-2 p-1.5 rounded-xl border border-white/[0.06] bg-white/[0.01] hover:bg-white/[0.04] transition-all"
      >
        {profile?.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt={displayName}
            className="w-7 h-7 rounded-lg object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
            {initials}
          </div>
        )}
        <span className="hidden sm:inline text-xs font-medium text-zinc-300 max-w-[80px] truncate">
          {displayName}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-zinc-500 hidden sm:inline" />
      </button>

      {dropdownOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setDropdownOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl border border-white/[0.08] bg-[#0e1018]/95 shadow-2xl py-1.5 backdrop-blur-md">

            {/* Infos mini */}
            <div className="px-3 py-2 border-b border-white/[0.06] mb-1">
              <div className="flex items-center gap-1.5">
                <p className="text-xs font-semibold text-zinc-200 truncate">{displayName}</p>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              </div>
              <p className="text-[10px] text-zinc-500 truncate mt-0.5">{user.email}</p>
            </div>

            {/* Actions */}
            <button
              type="button"
              onClick={() => {
                setDropdownOpen(false);
                setUserProfileModalOpen(true);
              }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.04] transition-colors"
            >
              <User className="w-4 h-4 text-zinc-500" />
              Mon Profil
            </button>

            <div className="my-1 border-t border-white/[0.06]" />

            <button
              type="button"
              onClick={() => {
                setDropdownOpen(false);
                handleSignOut();
              }}
              className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10 transition-colors"
            >
              <LogOut className="w-4 h-4 text-rose-400" />
              Se déconnecter
            </button>
          </div>
        </>
      )}

      <UserProfileModal open={modalOpen} onClose={() => setUserProfileModalOpen(false)} />
    </div>
  );
};

export default UserHeaderMenu;
