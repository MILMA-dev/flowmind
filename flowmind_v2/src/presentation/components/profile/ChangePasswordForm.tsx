/**
 * ChangePasswordForm — mise à jour du mot de passe
 */
import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { ProfileService } from '../../../core/ProfileService';

interface Props {
  userId: string;
  onSuccess?: () => void;
}

export default function ChangePasswordForm({ userId, onSuccess }: Props) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setOk(false);
    if (newPassword !== confirm) {
      setError('La confirmation ne correspond pas');
      return;
    }
    setBusy(true);
    try {
      const res = await ProfileService.changePassword(userId, {
        currentPassword,
        newPassword,
      });
      if (!res.ok) {
        setError(res.error ?? 'Échec');
        return;
      }
      setOk(true);
      setCurrent('');
      setNew('');
      setConfirm('');
      onSuccess?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
        <KeyRound className="w-3.5 h-3.5" />
        Sécurité · Mot de passe
      </div>

      <PwdField
        label="Mot de passe actuel"
        value={currentPassword}
        onChange={setCurrent}
        show={show}
        autoComplete="current-password"
      />
      <PwdField
        label="Nouveau mot de passe"
        value={newPassword}
        onChange={setNew}
        show={show}
        autoComplete="new-password"
        placeholder="8 caractères min."
      />
      <PwdField
        label="Confirmer"
        value={confirm}
        onChange={setConfirm}
        show={show}
        autoComplete="new-password"
      />

      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="text-[11px] text-zinc-500 hover:text-zinc-300 inline-flex items-center gap-1"
      >
        {show ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        {show ? 'Masquer' : 'Afficher'} les mots de passe
      </button>

      {error && (
        <p className="text-[12px] text-rose-300 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}
      {ok && (
        <p className="text-[12px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          Mot de passe mis à jour avec succès.
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !currentPassword || !newPassword}
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold
          bg-white/[0.04] text-zinc-200 border border-white/[0.08] hover:bg-white/[0.07]
          disabled:opacity-40 transition-colors"
      >
        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        Mettre à jour le mot de passe
      </button>
    </form>
  );
}

function PwdField({
  label,
  value,
  onChange,
  show,
  autoComplete,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  autoComplete: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">
        {label}
      </span>
      <input
        type={show ? 'text' : 'password'}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.08]
          text-sm text-zinc-100 outline-none focus:border-indigo-500/40 placeholder:text-zinc-600"
      />
    </label>
  );
}
