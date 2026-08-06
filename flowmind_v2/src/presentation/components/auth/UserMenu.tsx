/**
 * UserMenu — avatar sidebar (délègue au même profil que le header)
 */
import { useState } from 'react';
import { LogOut, Mail, ShieldCheck, User, UserCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ProfileService } from '../../../core/ProfileService';
import UserProfileModal from '../profile/UserProfileModal';

export default function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const user = auth.user;
  if (!user) return null;

  const profile = ProfileService.fetchProfile(user.id) ?? user;
  const initials = ProfileService.getInitials(profile);
  const avatarUrl = profile.avatarUrl;

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setConfirmOut(false);
          }}
          className={`flex items-center gap-2 w-full rounded-xl py-2 transition-colors
            text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]
            ${collapsed ? 'justify-center px-2' : 'px-3'}`}
          title={user.email}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="w-8 h-8 rounded-lg object-cover border border-white/10 shrink-0"
            />
          ) : (
            <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-200 text-[11px] font-bold border border-indigo-500/25 shrink-0">
              {initials || <User className="w-4 h-4" />}
            </span>
          )}
          {!collapsed && (
            <span className="min-w-0 text-left">
              <span className="block text-xs font-medium text-zinc-200 truncate">
                {profile.displayName}
              </span>
              <span className="block text-[10px] text-zinc-600 truncate">
                {user.email}
              </span>
            </span>
          )}
        </button>

        {open && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-40"
              aria-label="Fermer"
              onClick={() => {
                setOpen(false);
                setConfirmOut(false);
              }}
            />
            <div
              className={`absolute z-50 w-56 rounded-xl border border-white/[0.1] bg-[#12141c]/98 shadow-2xl py-1.5 backdrop-blur-xl
                ${collapsed ? 'left-full ml-2 bottom-0' : 'left-0 right-0 bottom-full mb-2'}`}
            >
              <div className="px-3 py-2 border-b border-white/[0.06]">
                <p className="text-xs font-semibold text-zinc-100 truncate">
                  {profile.displayName}
                </p>
                <p className="text-[10px] text-zinc-500 truncate flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3" />
                  {user.email}
                </p>
                {user.emailVerified && (
                  <p className="text-[10px] text-emerald-400/90 flex items-center gap-1 mt-1">
                    <ShieldCheck className="w-3 h-3" />
                    E-mail vérifié
                  </p>
                )}
              </div>
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
              {!confirmOut ? (
                <button
                  type="button"
                  onClick={() => setConfirmOut(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Se déconnecter
                </button>
              ) : (
                <div className="px-3 py-2 space-y-1.5">
                  <p className="text-[10px] text-rose-200/90">Confirmer la déconnexion ?</p>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        void auth.signOut();
                      }}
                      className="flex-1 py-1 rounded-md text-[10px] font-semibold bg-rose-500/25 text-rose-100 border border-rose-500/30"
                    >
                      Oui
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmOut(false)}
                      className="flex-1 py-1 rounded-md text-[10px] text-zinc-400 border border-white/10"
                    >
                      Non
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <UserProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} />
    </>
  );
}
