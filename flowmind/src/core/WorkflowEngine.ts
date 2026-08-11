/**
 * FlowMind — WorkflowEngine
 * Service applicatif de gestion des nœuds, liens et multi-workflows
 * Équipe MILMA Entreprise
 *
 * ZÉRO COUPLAGE UI : le canvas émet des événements ; le moteur valide
 * et persiste via StateStore + EventBus.
 */

import { EventBus } from './EventBus';
import { StateStore, uid, normalizeNode } from './StateStore';
import {
  AppEvents,
  DEFAULT_RECURRENCE,
  type CanvasViewport,
  type NodeType,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
} from './Types';

const WORKFLOW_COLORS = [
  '#6366f1',
  '#22d3ee',
  '#a78bfa',
  '#34d399',
  '#fbbf24',
  '#f472b6',
];

export interface AddNodeData {
  type?: NodeType;
  label?: string;
  x?: number;
  y?: number;
  description?: string;
  data?: Record<string, unknown>;
}

class WorkflowEngineImpl {
  private registered = false;

  /** Enregistre les listeners EventBus (bootstrap) */
  register(): void {
    if (this.registered) return;
    this.registered = true;

    EventBus.subscribe(AppEvents.CREATE_WORKFLOW_REQUESTED, (payload) => {
      const p = payload as { title?: string };
      this.createWorkflow(p?.title);
    });

    EventBus.subscribe(AppEvents.CREATE_NODE_REQUESTED, (payload) => {
      const p = payload as {
        workflowId?: string;
        node?: WorkflowNode;
        nodeData?: AddNodeData;
        // ConversionService path already mutates store — ignore if node already added
        fromCaptureId?: string;
        createdWorkflow?: boolean;
      };
      // Si ConversionService a déjà créé le nœud, ne pas doubler
      if (p?.fromCaptureId || p?.createdWorkflow) return;
      if (p?.workflowId && p?.node) {
        // Nœud déjà construit
        const wf = StateStore.getState().workflows.find((w) => w.id === p.workflowId);
        if (wf && !wf.nodes.some((n) => n.id === p.node!.id)) {
          StateStore.addNodeToWorkflow(p.workflowId, p.node);
          EventBus.publish(AppEvents.NODE_CREATED, {
            node: p.node,
            workflowId: p.workflowId,
          });
        }
        return;
      }
      if (p?.workflowId && p?.nodeData) {
        this.addNode(p.workflowId, p.nodeData);
      }
    });

    EventBus.subscribe(AppEvents.CREATE_CONNECTION_REQUESTED, (payload) => {
      const p = payload as {
        workflowId: string;
        sourceNodeId: string;
        targetNodeId: string;
      };
      if (p?.workflowId && p?.sourceNodeId && p?.targetNodeId) {
        this.connectNodes(p.workflowId, p.sourceNodeId, p.targetNodeId);
      }
    });

    EventBus.subscribe(AppEvents.NODE_MOVED, (payload) => {
      const p = payload as {
        workflowId: string;
        nodeId: string;
        x: number;
        y: number;
        // flag: already applied?
        apply?: boolean;
      };
      if (p?.apply === false) return;
      if (p?.workflowId && p?.nodeId != null && p.x != null && p.y != null) {
        // Évite double application si l'émetteur a déjà demandé l'apply
        this.moveNode(p.workflowId, p.nodeId, p.x, p.y, false);
      }
    });
  }

  /** Instancie un nouvel espace de travail nodal */
  createWorkflow(title?: string): Workflow {
    const state = StateStore.getState();
    const idx = state.workflows.length + 1;
    const now = new Date().toISOString();
    const color = WORKFLOW_COLORS[state.workflows.length % WORKFLOW_COLORS.length];

    const workflow: Workflow = {
      id: uid('wf'),
      title: title?.trim() || `Workflow ${idx}`,
      description: '',
      nodes: [],
      edges: [],
      tags: [],
      color,
      createdAt: now,
      updatedAt: now,
      viewport: { x: 40, y: 40, zoom: 1 },
    };

    StateStore.addWorkflow(workflow);
    StateStore.setActiveWorkflowId(workflow.id);
    EventBus.publish(AppEvents.WORKFLOW_CREATED, { workflow });
    EventBus.publish(AppEvents.WORKFLOW_SELECTED, { workflowId: workflow.id });
    this.toast('success', 'Workflow créé', workflow.title);
    return workflow;
  }

  /** Sélectionne le workflow actif (canvas) */
  selectWorkflow(workflowId: string | null): void {
    StateStore.setActiveWorkflowId(workflowId);
    EventBus.publish(AppEvents.WORKFLOW_SELECTED, { workflowId });
  }

  /** Renomme un workflow */
  renameWorkflow(workflowId: string, title: string): void {
    const t = title.trim();
    if (!t) return;
    StateStore.updateWorkflow(workflowId, { title: t });
    EventBus.publish(AppEvents.WORKFLOW_RENAMED, { workflowId, title: t });
  }

  /**
   * Suppression globale d'un workflow :
   * - détache activités planifiées & events liés
   * - ferme l'inspecteur si nœud appartenant au WF
   * - bascule automatiquement sur le workflow suivant
   */
  deleteWorkflow(workflowId: string): void {
    const state = StateStore.getState();
    const wf = state.workflows.find((w) => w.id === workflowId);
    if (!wf) return;

    // Détache réservations d'activités
    const activities = state.activities ?? [];
    for (const act of activities) {
      if (act.workflowId === workflowId) {
        StateStore.updateActivity({
          ...act,
          workflowId: null,
          updatedAt: new Date().toISOString(),
        });
      }
    }

    // Détache events calendrier liés
    for (const ev of state.events) {
      if (ev.linkedWorkflowId === workflowId) {
        StateStore.updateEvent({
          ...ev,
          linkedWorkflowId: null,
          linkedNodeId: null,
        });
      }
    }

    // Ferme inspecteur si nécessaire
    if (state.ui.selectedNodeId) {
      const still = wf.nodes.some((n) => n.id === state.ui.selectedNodeId);
      if (still) StateStore.closeInspector();
    }

    StateStore.removeWorkflow(workflowId);

    const next = StateStore.getState().workflows[0];
    if (next) {
      this.selectWorkflow(next.id);
    } else {
      this.selectWorkflow(null);
    }

    EventBus.publish(AppEvents.WORKFLOW_DELETED, { workflowId, title: wf.title });
    this.toast('info', 'Workflow supprimé', wf.title);

    // Fallback : si plus aucun workflow, créer un espace par défaut
    if (StateStore.getState().workflows.length === 0) {
      this.createWorkflow('Workflow principal');
    }
  }

  /** Applique la stratégie d'exécution AND/OR sur un nœud */
  setExecutionStrategy(
    workflowId: string,
    nodeId: string,
    strategy: 'AND' | 'OR'
  ): void {
    this.updateNode(workflowId, nodeId, {
      executionStrategy: strategy,
      joinMode: strategy === 'OR' ? 'any' : 'all',
    });
  }

  /** Ajoute un nœud avec coordonnées initiales */
  addNode(workflowId: string, nodeData: AddNodeData = {}): WorkflowNode | null {
    const wf = StateStore.getState().workflows.find((w) => w.id === workflowId);
    if (!wf) {
      this.toast('error', 'Workflow introuvable');
      return null;
    }

    const type: NodeType = nodeData.type ?? 'action';
    const offset = wf.nodes.length * 36;
    const node = normalizeNode({
      id: uid('node'),
      type,
      label: nodeData.label?.trim() || this.defaultLabel(type, wf.nodes.length + 1),
      x: nodeData.x ?? 120 + (offset % 280),
      y: nodeData.y ?? 100 + Math.floor(offset / 280) * 120,
      description: nodeData.description ?? '',
      data: nodeData.data ?? {},
      // Routines : récurrence quotidienne activée par défaut
      recurrence:
        type === 'routine'
          ? {
              ...DEFAULT_RECURRENCE,
              frequency: 'daily',
              enabled: true,
              nextRunAt: new Date(
                new Date().setHours(24, 0, 0, 0)
              ).toISOString(),
            }
          : undefined,
    });

    StateStore.addNodeToWorkflow(workflowId, node);
    EventBus.publish(AppEvents.NODE_CREATED, { node, workflowId });
    return node;
  }

  /**
   * Valide et crée un lien source(output) → target(input).
   * Refuse les self-loops et les doublons.
   */
  connectNodes(
    workflowId: string,
    sourceNodeId: string,
    targetNodeId: string
  ): WorkflowEdge | null {
    if (sourceNodeId === targetNodeId) {
      this.toast('warning', 'Connexion invalide', 'Un nœud ne peut pas se lier à lui-même');
      return null;
    }

    const wf = StateStore.getState().workflows.find((w) => w.id === workflowId);
    if (!wf) return null;

    const src = wf.nodes.find((n) => n.id === sourceNodeId);
    const tgt = wf.nodes.find((n) => n.id === targetNodeId);
    if (!src || !tgt) {
      this.toast('error', 'Nœud manquant pour la connexion');
      return null;
    }

    const exists = wf.edges.some(
      (e) => e.source === sourceNodeId && e.target === targetNodeId
    );
    if (exists) {
      this.toast('info', 'Lien déjà existant');
      return null;
    }

    const edge: WorkflowEdge = {
      id: uid('edge'),
      source: sourceNodeId,
      target: targetNodeId,
      sourceHandle: 'output',
      targetHandle: 'input',
    };

    StateStore.addEdgeToWorkflow(workflowId, edge);
    EventBus.publish(AppEvents.CONNECTION_CREATED, { edge, workflowId });
    return edge;
  }

  /** Met à jour la position spatiale d'un nœud */
  moveNode(
    workflowId: string,
    nodeId: string,
    newX: number,
    newY: number,
    publish = true
  ): void {
    StateStore.moveNode(workflowId, nodeId, newX, newY);
    if (publish) {
      EventBus.publish(AppEvents.NODE_MOVED, {
        workflowId,
        nodeId,
        x: newX,
        y: newY,
        apply: false, // déjà appliqué
      });
    }
  }

  /** Met à jour label / type / métadonnées d'un nœud */
  updateNode(
    workflowId: string,
    nodeId: string,
    patch: Partial<
      Pick<
        WorkflowNode,
        | 'label'
        | 'type'
        | 'description'
        | 'data'
        | 'priority'
        | 'status'
        | 'executionState'
        | 'dueDate'
        | 'subtasks'
        | 'recurrence'
        | 'progress'
        | 'trigger'
        | 'joinMode'
        | 'executionStrategy'
      >
    >
  ): void {
    // Garde joinMode ↔ executionStrategy synchronisés
    const synced = { ...patch };
    if (patch.executionStrategy && !patch.joinMode) {
      synced.joinMode = patch.executionStrategy === 'OR' ? 'any' : 'all';
    }
    if (patch.joinMode && !patch.executionStrategy) {
      synced.executionStrategy = patch.joinMode === 'any' ? 'OR' : 'AND';
    }
    StateStore.patchNodeSoft(workflowId, nodeId, synced);
    EventBus.publish(AppEvents.NODE_UPDATED, { workflowId, nodeId, patch: synced });
  }

  /** Sélectionne un nœud et ouvre l'inspecteur */
  selectNode(nodeId: string | null): void {
    StateStore.setSelectedNode(nodeId, nodeId != null);
  }

  /** Supprime un nœud et ses connexions */
  deleteNode(workflowId: string, nodeId: string): void {
    const sel = StateStore.getState().ui.selectedNodeId;
    if (sel === nodeId) StateStore.closeInspector();
    StateStore.removeNode(workflowId, nodeId);
    EventBus.publish(AppEvents.NODE_DELETED, { workflowId, nodeId });
  }

  /** Supprime une connexion */
  deleteConnection(workflowId: string, edgeId: string): void {
    StateStore.removeEdge(workflowId, edgeId);
    EventBus.publish(AppEvents.CONNECTION_DELETED, { workflowId, edgeId });
  }

  /** Persiste le viewport du workflow */
  saveViewport(workflowId: string, viewport: CanvasViewport): void {
    StateStore.setWorkflowViewport(workflowId, viewport);
  }

  private defaultLabel(type: NodeType, n: number): string {
    const labels: Record<NodeType, string> = {
      trigger: 'Trigger',
      action: 'Action',
      routine: 'Routine',
      goal: 'Goal',
      condition: 'Condition',
      output: 'Output',
      note: 'Note',
    };
    return `${labels[type]} ${n}`;
  }

  private toast(
    type: 'success' | 'info' | 'error' | 'warning',
    title: string,
    description?: string
  ): void {
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type,
      title,
      description,
      duration: 2400,
    });
  }
}

export const WorkflowEngine = new WorkflowEngineImpl();
export default WorkflowEngine;
