/**
 * UserProfileModal — affichage + édition du profil
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BadgeCheck,
  Calendar,
  Loader2,
  Mail,
  Save,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ProfileService } from '../../../core/ProfileService';
import type { ExtendedUserProfile, UserProfile } from '../../../core/Types';
import ChangePasswordForm from './ChangePasswordForm';
import SyncStatusBadge from './SyncStatusBadge';
import { HybridStorageAdapter } from '../../../core/storage/HybridStorageAdapter';

interface Props {
  open: boolean;
  onClose: () => void;
}

const ROLES = [
  'Étudiant',
  'Ingénieur',
  'Product',
  'Design',
  'Freelance',
  'Autre',
];

export default function UserProfileModal({ open, onClose }: Props) {
  const auth = useAuth();
  const [tab, setTab] = useState<'profile' | 'security'>('profile');
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [extended, setExtended] = useState<ExtendedUserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [role, setRole] = useState('');
  const [bio, setBio] = useState('');
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [publicProfile, setPublicProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !auth.user) return;
    const p = ProfileService.fetchProfile(auth.user.id);
    const ext = ProfileService.fetchExtendedProfile(auth.user.id);
    setProfile(p);
    setExtended(ext);
    if (p) {
      setDisplayName(p.displayName);
      setAvatarUrl(p.avatarUrl ?? '');
      setRole(p.role ?? '');
      setBio(p.bio ?? '');
      setNotifyEmail(p.preferences.notifyEmail ?? true);
      setPublicProfile(p.preferences.publicProfile ?? false);
    }
    // Background reconcile hybrid
    void HybridStorageAdapter.getUserProfile(auth.user.id).then((remote) => {
      if (remote) {
        setExtended(remote);
        setProfile(remote);
      }
    });
    setTab('profile');
    setError(null);
  }, [open, auth.user?.id]);

  useEffect(() => {
    return HybridStorageAdapter.onProfileChange((p) => {
      if (auth.user && p.id === auth.user.id) {
        setExtended(p);
        setProfile(p);
      }
    });
  }, [auth.user?.id]);

  const save = async () => {
    if (!auth.user) return;
    setBusy(true);
    setError(null);
    try {
      const res = await ProfileService.updateProfile(auth.user.id, {
        displayName,
        avatarUrl: avatarUrl.trim() || null,
        role: role || null,
        bio: bio || null,
        preferences: {
          notifyEmail,
          publicProfile,
          locale: 'fr',
        },
      });
      if (!res.ok) {
        setError(res.error ?? 'Erreur');
        return;
      }
      setProfile(res.profile ?? null);
      setExtended(ProfileService.fetchExtendedProfile(auth.user.id));
      await auth.refresh();
    } finally {
      setBusy(false);
    }
  };

  const user = profile ?? auth.user;
  if (!user) return null;

  const initials = ProfileService.getInitials(user);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[88] flex items-center justify-center px-4 py-6">
          <motion.button
            type="button"
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-label="Fermer"
          />
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10 }}
            className="relative w-full max-w-lg rounded-2xl border border-white/[0.1] bg-[#0e1018] shadow-2xl overflow-hidden max-h-[min(90dvh,720px)] flex flex-col"
          >
            {/* Header */}
            <div className="flex items-start gap-3 px-5 pt-5 pb-3 border-b border-white/[0.06]">
              <div className="relative shrink-0">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-14 h-14 rounded-2xl object-cover border border-white/10"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-lg font-bold text-white shadow-lg shadow-indigo-500/25">
                    {initials}
                  </div>
                )}
                {user.emailVerified && (
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-[#0e1018] flex items-center justify-center">
                    <BadgeCheck className="w-3 h-3 text-white" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold text-zinc-50 truncate">
                  {user.displayName}
                </h2>
                <p className="text-xs text-zinc-500 truncate flex items-center gap-1 mt-0.5">
                  <Mail className="w-3 h-3" />
                  {user.email}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2 items-center">
                  {user.emailVerified ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                      <BadgeCheck className="w-3 h-3" />
                      Vérifié
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-500/15 text-amber-200 border border-amber-500/25">
                      Non vérifié
                    </span>
                  )}
                  {role && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-indigo-500/15 text-indigo-200 border border-indigo-500/20">
                      {role}
                    </span>
                  )}
                </div>
                <div className="mt-2">
                  <SyncStatusBadge showForceButton />
                  {extended?.lastSyncedAt && (
                    <p className="text-[9px] text-zinc-600 mt-1">
                      Dernière sync :{' '}
                      {new Date(extended.lastSyncedAt).toLocaleString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                  {extended?.updatedAt && (
                    <p className="text-[9px] text-zinc-600">
                      Dernière modification :{' '}
                      {new Date(extended.updatedAt).toLocaleString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 px-5 pt-3">
              {(
                [
                  { id: 'profile' as const, label: 'Profil' },
                  { id: 'security' as const, label: 'Sécurité' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    tab === t.id
                      ? 'bg-indigo-500/15 text-indigo-200'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {tab === 'profile' ? (
                <>
                  {/* Meta lecture seule */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] px-3 py-2">
                      <p className="text-[9px] uppercase tracking-wider text-zinc-600 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        Membre depuis
                      </p>
                      <p className="text-xs text-zinc-300 mt-0.5">
                        {new Date(user.createdAt).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] px-3 py-2">
                      <p className="text-[9px] uppercase tracking-wider text-zinc-600 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        Dernière connexion
                      </p>
                      <p className="text-xs text-zinc-300 mt-0.5">
                        {user.lastLoginAt
                          ? new Date(user.lastLoginAt).toLocaleString('fr-FR', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <label className="block">
                    <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                      Nom complet
                    </span>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08]
                        text-sm text-zinc-100 outline-none focus:border-indigo-500/40"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                      URL avatar
                    </span>
                    <input
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://…"
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08]
                        text-sm text-zinc-100 outline-none focus:border-indigo-500/40 placeholder:text-zinc-600"
                    />
                  </label>

                  <label className="block">
                    <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                      Rôle / filière
                    </span>
                    <select
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="mt-1 w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08]
                        text-sm text-zinc-100 outline-none"
                    >
                      <option value="">— Non renseigné —</option>
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
                      Bio
                    </span>
                    <textarea
                      value={bio}
                      onChange={(e) => setBio(e.target.value.slice(0, 280))}
                      rows={3}
                      placeholder="Quelques mots sur vous…"
                      className="mt-1 w-full resize-none px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08]
                        text-sm text-zinc-100 outline-none focus:border-indigo-500/40 placeholder:text-zinc-600"
                    />
                    <span className="text-[9px] text-zinc-600">{bio.length}/280</span>
                  </label>

                  <div className="space-y-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      Préférences
                    </p>
                    <Toggle
                      label="Notifications e-mail"
                      checked={notifyEmail}
                      onChange={setNotifyEmail}
                    />
                    <Toggle
                      label="Profil visible (public)"
                      checked={publicProfile}
                      onChange={setPublicProfile}
                    />
                  </div>

                  {error && (
                    <p className="text-[12px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
                      {error}
                    </p>
                  )}
                </>
              ) : (
                <ChangePasswordForm userId={user.id} />
              )}
            </div>

            {tab === 'profile' && (
              <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold
                    bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-40 shadow-md shadow-indigo-500/25"
                >
                  {busy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Enregistrer
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between w-full text-left"
    >
      <span className="text-xs text-zinc-300">{label}</span>
      <span
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? 'bg-indigo-500' : 'bg-white/10'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-4' : ''
          }`}
        />
      </span>
    </button>
  );
}
