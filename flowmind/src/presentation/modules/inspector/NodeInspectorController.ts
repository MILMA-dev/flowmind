/**
 * NodeInspectorController — API de contrôle du panneau latéral
 * Liaison EventBus ↔ StateStore (sans dépendance React)
 * Équipe MILMA Entreprise
 */

import { EventBus } from '../../../core/EventBus';
import { StateStore } from '../../../core/StateStore';
import { AppEvents } from '../../../core/Types';

class NodeInspectorControllerImpl {
  private registered = false;

  register(): void {
    if (this.registered) return;
    this.registered = true;

    EventBus.subscribe('OPEN_NODE_INSPECTOR', (payload) => {
      const p = payload as { nodeId: string };
      if (p?.nodeId) this.open(p.nodeId);
    });

    EventBus.subscribe('CLOSE_NODE_INSPECTOR', () => {
      this.close();
    });

    // Ferme l'inspecteur quand on change de zone
    EventBus.subscribe(AppEvents.ZONE_CHANGED, () => {
      this.close();
    });
  }

  open(nodeId: string): void {
    StateStore.setSelectedNode(nodeId, true);
  }

  close(): void {
    StateStore.closeInspector();
  }

  toggle(nodeId: string): void {
    const { selectedNodeId, inspectorOpen } = StateStore.getState().ui;
    if (inspectorOpen && selectedNodeId === nodeId) {
      this.close();
    } else {
      this.open(nodeId);
    }
  }

  isOpen(): boolean {
    return StateStore.getState().ui.inspectorOpen;
  }

  selectedId(): string | null {
    return StateStore.getState().ui.selectedNodeId;
  }
}

export const NodeInspectorController = new NodeInspectorControllerImpl();
export default NodeInspectorController;
