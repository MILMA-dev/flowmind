/**
 * LoginForm — formulaire connexion / inscription
 */
import { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type AuthTab = 'login' | 'signup';

interface Props {
  tab: AuthTab;
  onTabChange: (t: AuthTab) => void;
  onSuccess?: () => void;
}

export default function LoginForm({ tab, onTabChange, onSuccess }: Props) {
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    setBusy(true);
    try {
      if (tab === 'signup') {
        const res = await auth.signUp({ email, password, displayName });
        if (!res.ok) {
          setLocalError(res.error ?? 'Erreur');
        } else {
          onSuccess?.();
        }
      } else {
        const res = await auth.signIn({ email, password });
        if (!res.ok) {
          setLocalError(res.error ?? 'Erreur');
        } else {
          onSuccess?.();
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const err = localError || auth.error;

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex p-0.5 rounded-xl bg-white/[0.03] border border-white/[0.08]">
        {(
          [
            { id: 'login' as const, label: 'Se connecter' },
            { id: 'signup' as const, label: "S'inscrire" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              onTabChange(t.id);
              setLocalError(null);
            }}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === t.id
                ? 'bg-indigo-500/20 text-indigo-200'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'signup' && (
        <label className="block">
          <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
            Nom
          </span>
          <div className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] focus-within:border-indigo-500/40">
            <User className="w-4 h-4 text-zinc-600 shrink-0" />
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Votre nom"
              required
              minLength={2}
              className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
              autoComplete="name"
            />
          </div>
        </label>
      )}

      <label className="block">
        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
          E-mail
        </span>
        <div className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] focus-within:border-indigo-500/40">
          <Mail className="w-4 h-4 text-zinc-600 shrink-0" />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
            className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            autoComplete="email"
          />
        </div>
      </label>

      <label className="block">
        <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
          Mot de passe
        </span>
        <div className="mt-1 flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] focus-within:border-indigo-500/40">
          <Lock className="w-4 h-4 text-zinc-600 shrink-0" />
          <input
            type={showPwd ? 'text' : 'password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={tab === 'signup' ? '8 caractères min.' : '••••••••'}
            className="flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
            autoComplete={tab === 'signup' ? 'new-password' : 'current-password'}
          />
          <button
            type="button"
            onClick={() => setShowPwd((v) => !v)}
            className="text-zinc-600 hover:text-zinc-300 p-0.5"
            tabIndex={-1}
          >
            {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </label>

      {err && (
        <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-3 py-2.5 text-[12px] text-rose-100/95 leading-relaxed">
          {err}
        </div>
      )}

      <p className="text-[10px] text-zinc-600 leading-relaxed">
        {tab === 'login'
          ? 'Connexion cloud multi-appareils : le même e-mail / mot de passe fonctionne sur téléphone et PC.'
          : 'Le compte est enregistré dans le cloud partagé — reconnectez-vous ensuite depuis un autre appareil.'}
      </p>

      <button
        type="submit"
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
          bg-indigo-500 text-white text-sm font-semibold hover:bg-indigo-400
          disabled:opacity-50 shadow-lg shadow-indigo-500/25 transition-colors"
      >
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        {tab === 'login' ? 'Se connecter' : 'Créer mon compte'}
      </button>
    </form>
  );
}
