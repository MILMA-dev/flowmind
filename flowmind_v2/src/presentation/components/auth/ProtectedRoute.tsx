/**
 * ProtectedRoute — bloque l'accès si aucune session active
 */
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import AuthModal from './AuthModal';

interface Props {
  children: ReactNode;
  /** Conservé pour compat — la vérif e-mail n'est plus exigée */
  requireVerified?: boolean;
}

export default function ProtectedRoute({ children }: Props) {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-[var(--fm-surface-0,#07080c)] text-zinc-100 gap-3">
        <Loader2 className="w-7 h-7 text-indigo-400 animate-spin" />
        <p className="text-xs text-zinc-500">Vérification de la session…</p>
      </div>
    );
  }

  if (auth.status === 'unauthenticated' || !auth.session) {
    return <AuthModal />;
  }

  return <>{children}</>;
}
