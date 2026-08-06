/**
 * FlowMind — Personal OS
 * Shell applicatif multi-zones
 * Bootstrap UI — Équipe MILMA Entreprise
 */
import { useEffect, useState } from 'react';
import { StateStore } from './core/StateStore';
import { EventBus } from './core/EventBus';
import { AppEvents } from './core/Types';
import { CaptureService } from './core/CaptureService';
import { ConversionService } from './core/ConversionService';
import { WorkflowEngine } from './core/WorkflowEngine';
import { SubtaskManager } from './core/SubtaskManager';
import { RecurrenceEngine } from './core/RecurrenceEngine';
import { NodeInspectorController } from './presentation/modules/inspector/NodeInspectorController';
import { ExecutionEngine } from './core/ExecutionEngine';
import { TriggerService } from './core/TriggerService';
import { NoteManager } from './core/NoteManager';
import { TodoManager } from './core/TodoManager';
import { CalendarManager } from './core/CalendarManager';
import { Sidebar, BottomBar, ZoneHeader } from './presentation/layouts/Navigation';
import ViewManager from './presentation/ViewManager';
import OfflineBanner from './presentation/components/common/OfflineBanner';
import { OfflineQueueProcessor } from './core/services/OfflineQueueProcessor';
import QuickCaptureModal, { CaptureFAB } from './presentation/components/QuickCaptureModal';
import ToastStack from './presentation/components/ToastStack';
import { useIsDesktop } from './hooks/useMediaQuery';
import { DragDropProvider } from './context/DragDropContext';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './presentation/context/AuthContext';
import { SyncProvider } from './presentation/context/SyncContext';
import ProtectedRoute from './presentation/components/auth/ProtectedRoute';
import DropZoneOverlay from './presentation/components/common/DropZoneOverlay';
import ConversionPreviewModal from './presentation/components/modals/ConversionPreviewModal';
import MicroFeedback from './presentation/components/ui/MicroFeedback';
import TouchDragOverlay from './presentation/components/ui/TouchDragOverlay';

function BootScreen() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-[#07080c] text-zinc-100">
      <div className="relative mb-6">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-2xl shadow-indigo-500/30 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3z"
              fill="white"
              fillOpacity="0.95"
            />
          </svg>
        </div>
        <span className="absolute -inset-3 rounded-3xl border border-indigo-500/20 animate-ping opacity-40" />
      </div>
      <p className="text-sm font-semibold tracking-tight">FlowMind</p>
      <p className="text-[11px] text-zinc-500 mt-1 uppercase tracking-[0.2em]">Personal OS</p>
      <p className="text-[11px] text-zinc-600 mt-6">Hydratation du StateStore…</p>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const isDesktop = useIsDesktop();

  useEffect(() => {
    // Bootstrap core system MILMA
    EventBus.setDebug(import.meta.env.DEV);
    StateStore.hydrate();

    // Enregistrement des services applicatifs (écoute EventBus)
    OfflineQueueProcessor.register();
    CaptureService.register();
    ConversionService.register();
    WorkflowEngine.register();
    SubtaskManager.register();
    RecurrenceEngine.register();
    NodeInspectorController.register();
    ExecutionEngine.register();
    TriggerService.register();
    NoteManager.register();
    TodoManager.register();
    CalendarManager.register();

    // Évalue les graphes après hydratation
    for (const wf of StateStore.getState().workflows) {
      ExecutionEngine.evaluateAll(wf.id);
    }

    // Raccourcis clavier zones 1-5 (hors champs de saisie)
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      // Ne pas changer de zone si modal ouverte
      if (StateStore.getState().ui.quickCaptureOpen) return;

      const map: Record<string, Parameters<typeof StateStore.setActiveZone>[0]> = {
        '1': 'workflows',
        '2': 'notes',
        '3': 'todos',
        '4': 'calendar',
        '5': 'braindump',
      };
      if (map[e.key]) {
        StateStore.setActiveZone(map[e.key]);
      }
    };
    window.addEventListener('keydown', onKey);

    const unsubSaved = EventBus.subscribe(AppEvents.DATA_SAVED, () => {
      /* persistence heartbeat */
    });

    const t = requestAnimationFrame(() => setReady(true));

    return () => {
      window.removeEventListener('keydown', onKey);
      unsubSaved();
      cancelAnimationFrame(t);
    };
  }, []);

  useEffect(() => {
    void isDesktop;
  }, [isDesktop]);

  if (!ready) return <BootScreen />;

  return (
    <ThemeProvider>
      <AuthProvider>
        <ProtectedRoute>
          <SyncProvider>
            <DragDropProvider>
              <div className="h-dvh flex overflow-hidden bg-[var(--fm-surface-0,#07080c)] text-[var(--fm-text,#f4f4f5)] antialiased">
                {/* Ambient glow */}
                <div
                  className="pointer-events-none fixed inset-0 opacity-40 theme-light:opacity-20"
                  aria-hidden
                  style={{
                    background:
                      'radial-gradient(ellipse 80% 50% at 20% -10%, rgba(99,102,241,0.18), transparent 50%), radial-gradient(ellipse 60% 40% at 90% 110%, rgba(139,92,246,0.12), transparent 45%)',
                  }}
                />

                <Sidebar />

                <div className="relative flex-1 flex flex-col min-w-0 min-h-0">
                  <ZoneHeader />
                  <OfflineBanner />
                  <main className="flex-1 min-h-0 flex flex-col pb-[4.75rem] lg:pb-0">
                    <ViewManager />
                  </main>
                </div>

                <BottomBar />
                <CaptureFAB />
                <QuickCaptureModal />
                <ToastStack />
                <DropZoneOverlay />
                <TouchDragOverlay />
                <ConversionPreviewModal />
                <MicroFeedback />
              </div>
            </DragDropProvider>
          </SyncProvider>
        </ProtectedRoute>
      </AuthProvider>
    </ThemeProvider>
  );
}
