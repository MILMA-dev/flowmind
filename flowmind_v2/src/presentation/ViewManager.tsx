/**
 * FlowMind — ViewManager
 * Orchestrateur du changement de zones + drop shells cross-feature
 * Équipe MILMA Entreprise
 */
import { AnimatePresence, motion } from 'framer-motion';
import type { ZoneId } from '../core/Types';
import { useActiveZone, useAppState } from '../hooks/useStateStore';
import WorkflowView from './views/WorkflowView';
import NotesView from './views/NotesView';
import TodosView from './views/TodosView';
import CalendarView from './views/CalendarView';
import BrainDumpView from './views/BrainDumpView';
import SettingsView from './views/SettingsView';
import ZoneDropShell from './components/common/ZoneDropShell';
import { useThemeOptional } from '../hooks/useTheme';

const VIEWS: Record<ZoneId, React.ComponentType> = {
  workflows: WorkflowView,
  notes: NotesView,
  todos: TodosView,
  calendar: CalendarView,
  braindump: BrainDumpView,
};

const zoneOrder: ZoneId[] = [
  'workflows',
  'notes',
  'todos',
  'calendar',
  'braindump',
];

export default function ViewManager() {
  const { activeZone } = useActiveZone();
  const { ui } = useAppState();
  const theme = useThemeOptional();
  const reduceMotion = theme?.reduceMotion || ui.reduceMotion;
  const settingsOpen = ui.settingsOpen;
  const View = VIEWS[activeZone];
  const idx = zoneOrder.indexOf(activeZone);
  const viewKey = settingsOpen ? 'settings' : activeZone;

  return (
    <div className="relative flex-1 min-h-0 overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={viewKey}
          initial={
            reduceMotion
              ? { opacity: 0 }
              : { opacity: 0, y: 8, filter: 'blur(4px)' }
          }
          animate={
            reduceMotion
              ? { opacity: 1 }
              : { opacity: 1, y: 0, filter: 'blur(0px)' }
          }
          exit={
            reduceMotion
              ? { opacity: 0 }
              : { opacity: 0, y: -6, filter: 'blur(4px)' }
          }
          transition={{ duration: reduceMotion ? 0.1 : 0.22, ease: [0.22, 1, 0.36, 1] }}
          className={`absolute inset-0 ${
            !settingsOpen && activeZone === 'workflows'
              ? 'overflow-hidden flex flex-col'
              : 'overflow-y-auto overflow-x-hidden'
          }`}
          data-zone={viewKey}
          data-zone-index={idx}
        >
          {settingsOpen ? (
            <SettingsView />
          ) : (
            <ZoneDropShell
              module={activeZone}
              className={
                activeZone === 'workflows'
                  ? 'flex flex-col h-full'
                  : 'min-h-full'
              }
            >
              <View />
            </ZoneDropShell>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
