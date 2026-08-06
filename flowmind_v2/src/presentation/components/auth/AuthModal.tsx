/**
 * AuthModal — Écran d'authentification (login / signup)
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Sparkles } from 'lucide-react';
import LoginForm, { type AuthTab } from './LoginForm';

export default function AuthModal() {
  const [tab, setTab] = useState<AuthTab>('login');

  return (
    <div className="min-h-dvh flex items-center justify-center px-4 py-10 bg-[var(--fm-surface-0,#07080c)] text-[var(--fm-text,#f4f4f5)] relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        aria-hidden
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(99,102,241,0.25), transparent 55%), radial-gradient(ellipse 50% 40% at 90% 100%, rgba(139,92,246,0.15), transparent 50%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative w-full max-w-[420px]"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-2xl shadow-indigo-500/30 mb-4">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">FlowMind</h1>
          <p className="text-[11px] text-zinc-500 mt-1 uppercase tracking-[0.18em]">
            Personal OS · Accès sécurisé
          </p>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-[var(--fm-surface-1,#0c0d12)]/95 backdrop-blur-xl shadow-2xl p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-4 text-[11px] text-zinc-500">
            <Shield className="w-3.5 h-3.5 text-indigo-400" />
            Cloud multi-appareils · un compte partout
          </div>

          <LoginForm tab={tab} onTabChange={setTab} />
        </div>

        <p className="text-center text-[10px] text-zinc-600 mt-5">
          MILMA Entreprise · FlowMind Auth
        </p>
      </motion.div>
    </div>
  );
}
