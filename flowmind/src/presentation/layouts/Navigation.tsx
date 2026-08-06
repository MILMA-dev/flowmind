/**
 * FlowMind — Navigation
 * Sidebar collapsible (PC) + Bottom Bar tactile (Mobile)
 * Équipe MILMA — Lead UI/UX
 */
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  StickyNote,
  ListChecks,
  CalendarDays,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  CircleDot,
  Settings2,
} from 'lucide-react';
import type { ZoneId } from '../../core/Types';
import { ZONE_META } from '../../core/Types';
import { StateStore } from '../../core/StateStore';
import { useActiveZone, useUI, useAppState } from '../../hooks/useStateStore';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { useUniversalDrop } from '../../hooks/useUniversalDrop';
import UserHeaderMenu from '../components/header/UserHeaderMenu';

const ZONE_ICONS: Record<ZoneId, React.ReactNode> = {
  workflows: <LayoutDashboard className="w-5 h-5" strokeWidth={1.75} />,
  notes: <StickyNote className="w-5 h-5" strokeWidth={1.75} />,
  todos: <ListChecks className="w-5 h-5" strokeWidth={1.75} />,
  calendar: <CalendarDays className="w-5 h-5" strokeWidth={1.75} />,
  braindump: <Inbox className="w-5 h-5" strokeWidth={1.75} />,
};

const ZONES: ZoneId[] = ['workflows', 'notes', 'todos', 'calendar', 'braindump'];

function ZoneButton({
  zone,
  active,
  collapsed,
  onSelect,
  badge,
}: {
  zone: ZoneId;
  active: boolean;
  collapsed: boolean;
  onSelect: () => void;
  badge?: number;
}) {
  const meta = ZONE_META[zone];
  // Drop cross-feature vers une autre Zone de Travail
  const { dropHandlers, isOver, canAcceptCurrent } = useUniversalDrop({
    targetModule: zone,
    requirePreview: zone === 'calendar' || zone === 'workflows',
    onConverted: () => onSelect(),
  });

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${meta.label} · déposez pour convertir`}
      {...dropHandlers}
      className={`
        group relative flex items-center gap-3 w-full rounded-xl
        transition-all duration-200 ease-out
        ${
          collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
        }
        ${
          active
            ? 'bg-indigo-500/15 text-indigo-300 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.35)]'
            : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]'
        }
        ${isOver && canAcceptCurrent ? 'fm-nav-drop-hot text-indigo-200' : ''}
        ${isOver && !canAcceptCurrent ? 'ring-1 ring-rose-400/40' : ''}
      `}
    >
      {active && (
        <motion.span
          layoutId="nav-active-pill"
          className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-indigo-400"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        />
      )}
      <span className={`shrink-0 ${active ? 'text-indigo-300' : 'text-zinc-500 group-hover:text-zinc-300'}`}>
        {ZONE_ICONS[zone]}
      </span>
      {!collapsed && (
        <span className="flex-1 text-left text-sm font-medium tracking-tight truncate">
          {meta.shortLabel}
        </span>
      )}
      {!collapsed && badge !== undefined && badge > 0 && (
        <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 tabular-nums">
          {badge}
        </span>
      )}
      {collapsed && badge !== undefined && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-indigo-400 ring-2 ring-[#0c0d12]" />
      )}
    </button>
  );
}

/** Sidebar desktop collapsible */
export function Sidebar() {
  const { activeZone, setZone } = useActiveZone();
  const { ui, toggleSidebar } = useUI();
  const state = useAppState();
  const collapsed = ui.sidebarCollapsed;
  const captureCount = state.captures.filter((c) => c.status === 'raw').length;

  return (
    <aside
      className={`
        hidden lg:flex flex-col h-full shrink-0
        border-r border-white/[0.06] bg-[#0a0b10]/95 backdrop-blur-xl
        transition-[width] duration-300 ease-out
        ${collapsed ? 'w-[72px]' : 'w-[240px]'}
      `}
    >
      {/* Brand */}
      <div className={`flex items-center gap-2.5 h-16 border-b border-white/[0.06] ${collapsed ? 'px-3 justify-center' : 'px-4'}`}>
        <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
          <Sparkles className="w-4.5 h-4.5 text-white" strokeWidth={2} />
          <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#0a0b10]" />
        </div>
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="min-w-0"
            >
              <p className="text-sm font-semibold text-zinc-100 tracking-tight leading-none">FlowMind</p>
              <p className="text-[10px] text-zinc-500 mt-0.5 font-medium tracking-wide uppercase">Personal OS</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Zones */}
      <nav className={`flex-1 py-4 space-y-1 overflow-y-auto ${collapsed ? 'px-2' : 'px-3'}`}>
        {!collapsed && (
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
            Zones de Travail
          </p>
        )}
        {ZONES.map((zone) => (
          <ZoneButton
            key={zone}
            zone={zone}
            active={activeZone === zone}
            collapsed={collapsed}
            onSelect={() => setZone(zone)}
            badge={zone === 'braindump' ? captureCount : undefined}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className={`border-t border-white/[0.06] py-3 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
        {!collapsed && state.lastSavedAt && (
          <div className="flex items-center gap-1.5 px-3 mb-2 text-[10px] text-zinc-600">
            <CircleDot className="w-2.5 h-2.5 text-emerald-500/80" />
            <span>Sync locale active</span>
          </div>
        )}
        <button
          type="button"
          onClick={() => StateStore.updateUI({ settingsOpen: true })}
          className={`
            flex items-center gap-2 w-full rounded-xl py-2.5 text-zinc-500
            hover:text-zinc-200 hover:bg-white/[0.04] transition-colors
            ${collapsed ? 'justify-center px-2' : 'px-3'}
            ${state.ui.settingsOpen ? 'bg-indigo-500/10 text-indigo-300' : ''}
          `}
          title="Paramètres"
        >
          <Settings2 className="w-5 h-5" strokeWidth={1.75} />
          {!collapsed && <span className="text-sm">Paramètres</span>}
        </button>
        <button
          type="button"
          onClick={toggleSidebar}
          className={`
            flex items-center gap-2 w-full rounded-xl py-2.5 text-zinc-500
            hover:text-zinc-200 hover:bg-white/[0.04] transition-colors
            ${collapsed ? 'justify-center px-2' : 'px-3'}
          `}
          title={collapsed ? 'Étendre la sidebar' : 'Réduire la sidebar'}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-5 h-5" strokeWidth={1.75} />
          ) : (
            <>
              <PanelLeftClose className="w-5 h-5" strokeWidth={1.75} />
              <span className="text-sm">Réduire</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

/** Bottom bar mobile */
export function BottomBar() {
  const { activeZone, setZone } = useActiveZone();
  const state = useAppState();
  const captureCount = state.captures.filter((c) => c.status === 'raw').length;

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 safe-bottom">
      <div className="mx-2 mb-2 rounded-2xl border border-white/[0.08] bg-[#0c0d12]/90 backdrop-blur-xl shadow-2xl shadow-black/40">
        <div className="flex items-stretch justify-around px-1 py-1.5">
          {ZONES.map((zone) => {
            const active = activeZone === zone;
            const meta = ZONE_META[zone];
            return (
              <button
                key={zone}
                type="button"
                onClick={() => setZone(zone)}
                className={`
                  relative flex flex-col items-center justify-center gap-0.5
                  flex-1 min-w-0 py-2 px-1 rounded-xl transition-all duration-200
                  ${active ? 'text-indigo-300' : 'text-zinc-500 active:text-zinc-300'}
                `}
              >
                {active && (
                  <motion.span
                    layoutId="bottom-active"
                    className="absolute inset-1 rounded-xl bg-indigo-500/12"
                    transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  />
                )}
                <span className="relative z-10">
                  {ZONE_ICONS[zone]}
                  {zone === 'braindump' && captureCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-indigo-500 text-[9px] font-bold text-white flex items-center justify-center">
                      {captureCount > 9 ? '9+' : captureCount}
                    </span>
                  )}
                </span>
                <span className="relative z-10 text-[10px] font-medium truncate max-w-full">
                  {meta.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

/** En-tête de zone avec badge indicateur + accès Capture rapide */
export function ZoneHeader() {
  const { activeZone } = useActiveZone();
  const state = useAppState();
  const settingsOpen = state.ui.settingsOpen;
  const meta = settingsOpen
    ? { label: 'Paramètres', description: 'Thèmes, backup & préférences' }
    : ZONE_META[activeZone];
  const isDesktop = useIsDesktop();

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between h-14 lg:h-16 px-4 lg:px-6 border-b border-[var(--fm-border,rgba(255,255,255,0.06))] bg-[var(--fm-surface-1,#0c0d12)]/80 backdrop-blur-xl">
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.04] text-indigo-300 lg:hidden">
          {settingsOpen ? (
            <Settings2 className="w-4 h-4" />
          ) : (
            ZONE_ICONS[activeZone]
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base lg:text-lg font-semibold text-[var(--fm-text,#f4f4f5)] tracking-tight truncate">
              {meta.label}
            </h1>
            {!settingsOpen && (
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-indigo-500/10 text-indigo-300/90 border border-indigo-500/20">
                Zone
              </span>
            )}
          </div>
          <p className="text-xs text-zinc-500 truncate hidden sm:block">{meta.description}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {settingsOpen ? (
          <button
            type="button"
            onClick={() => StateStore.updateUI({ settingsOpen: false })}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
              text-zinc-300 bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] transition-colors"
          >
            Retour
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => StateStore.updateUI({ settingsOpen: true })}
              className="lg:hidden p-2 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05]"
              title="Paramètres"
            >
              <Settings2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => StateStore.setQuickCaptureOpen(true)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium
                text-indigo-300 bg-indigo-500/10 border border-indigo-500/20
                hover:bg-indigo-500/20 transition-colors"
              title="Capture rapide (⌘K / Alt+N)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Capturer</span>
              {isDesktop && (
                <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-zinc-500 bg-white/[0.04] border border-white/[0.08] ml-0.5">
                  ⌘K
                </kbd>
              )}
            </button>
          </>
        )}

        <div className="border-l border-white/[0.06] h-5 pl-2 flex items-center shrink-0">
          <UserHeaderMenu />
        </div>
      </div>
    </header>
  );
}

export default Sidebar;
