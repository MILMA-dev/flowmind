/**
 * UserHeaderMenu — avatar + dropdown (profil / déconnexion) en en-tête
 */
import { useState } from 'react';
import {
  ChevronDown,
  LogOut,
  Mail,
  Settings2,
  ShieldCheck,
  UserCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ProfileService } from '../../../core/ProfileService';
import { StateStore } from '../../../core/StateStore';
import UserProfileModal from '../profile/UserProfileModal';
import SyncStatusBadge from '../profile/SyncStatusBadge';

export default function UserHeaderMenu() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);

  const user = auth.user;
  if (!user) return null;

  const profile = ProfileService.fetchProfile(user.id) ?? user;
  const initials = ProfileService.getInitials(profile);
  const avatarUrl = profile.avatarUrl;

  const doSignOut = async () => {
    setConfirmOut(false);
    setOpen(false);
    await auth.signOut();
  };

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setConfirmOut(false);
          }}
          className="inline-flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl
            border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]
            transition-colors max-w-[200px]"
          title={user.email}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-7 h-7 rounded-lg object-cover border border-white/10"
            />
          ) : (
            <span className="flex items-center justify-center w-7 h-7 rounded-lg
              bg-gradient-to-br from-indigo-500 to-violet-600 text-[10px] font-bold text-white">
              {initials}
            </span>
          )}
          <span className="hidden md:block min-w-0 text-left">
            <span className="block text-[11px] font-medium text-zinc-200 truncate leading-tight">
              {profile.displayName}
            </span>
            <span className="block text-[9px] text-zinc-600 truncate leading-tight">
              {user.email}
            </span>
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 text-zinc-500 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
        </button>

        {open && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40"
              aria-label="Fermer le menu"
              onClick={() => {
                setOpen(false);
                setConfirmOut(false);
              }}
            />
            <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-xl border border-white/[0.1]
              bg-[#12141c]/98 shadow-2xl backdrop-blur-xl overflow-hidden">
              <div className="px-3 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2.5">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="w-10 h-10 rounded-xl object-cover border border-white/10"
                    />
                  ) : (
                    <span className="flex items-center justify-center w-10 h-10 rounded-xl
                      bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-bold text-white">
                      {initials}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zinc-100 truncate">
                      {profile.displayName}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate flex items-center gap-1">
                      <Mail className="w-3 h-3 shrink-0" />
                      {user.email}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 mt-2 items-center">
                  {user.emailVerified && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold
                      bg-emerald-500/15 text-emerald-300 border border-emerald-500/20">
                      <ShieldCheck className="w-2.5 h-2.5" />
                      Vérifié
                    </span>
                  )}
                  {profile.role && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-medium
                      bg-indigo-500/15 text-indigo-200 border border-indigo-500/20">
                      {profile.role}
                    </span>
                  )}
                  <SyncStatusBadge compact />
                </div>
              </div>

              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setProfileOpen(true);
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.05]"
                >
                  <UserCircle2 className="w-3.5 h-3.5 text-indigo-300" />
                  Mon profil
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    StateStore.updateUI({ settingsOpen: true });
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-zinc-200 hover:bg-white/[0.05]"
                >
                  <Settings2 className="w-3.5 h-3.5 text-zinc-400" />
                  Paramètres
                </button>
              </div>

              <div className="border-t border-white/[0.06] py-1">
                {!confirmOut ? (
                  <button
                    type="button"
                    onClick={() => setConfirmOut(true)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium
                      text-rose-300 hover:bg-rose-500/10"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Se déconnecter
                  </button>
                ) : (
                  <div className="px-3 py-2 space-y-2">
                    <p className="text-[10px] text-rose-200/90">
                      Terminer la session sur cet appareil ?
                    </p>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void doSignOut()}
                        className="flex-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold
                          bg-rose-500/25 text-rose-100 border border-rose-500/40 hover:bg-rose-500/35"
                      >
                        Confirmer
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmOut(false)}
                        className="flex-1 px-2 py-1.5 rounded-lg text-[10px] text-zinc-400
                          border border-white/[0.08] hover:text-zinc-200"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <UserProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </>
  );
}
