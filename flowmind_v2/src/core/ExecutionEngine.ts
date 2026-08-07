/**
 * FlowMind — ExecutionEngine
 * Machine à états + propagation en cascade du graphe nodal
 * Équipe MILMA Entreprise
 *
 * Graphe multi-connexions :
 *  - 1→N : un parent Completed propage vers TOUS ses enfants
 *  - N→1 : porte AND (tous parents) ou OR (au moins un)
 *
 * joinMode 'all'|'any'  ↔  executionStrategy 'AND'|'OR'
 * Anti-boucle : set de visitation + détection de cycles
 */

import { EventBus } from './EventBus';
import { StateStore, uid } from './StateStore';
import {
  AppEvents,
  joinModeToStrategy,
  strategyToJoinMode,
  type EdgeActivation,
  type ExecutionGraph,
  type ExecutionState,
  type ExecutionStrategy,
  type FlowPulse,
  type JoinMode,
  type Workflow,
  type WorkflowEdge,
  type WorkflowNode,
} from './Types';

/** Résout la porte logique d'un nœud (N→1) */
export function resolveExecutionStrategy(node: WorkflowNode): ExecutionStrategy {
  if (node.executionStrategy === 'AND' || node.executionStrategy === 'OR') {
    return node.executionStrategy;
  }
  return joinModeToStrategy(node.joinMode);
}

export function resolveJoinMode(node: WorkflowNode): JoinMode {
  return strategyToJoinMode(resolveExecutionStrategy(node));
}

const TERMINAL: ExecutionState[] = ['completed', 'failed', 'skipped'];
const SUCCESS_STATES: ExecutionState[] = ['completed', 'skipped'];

function isSuccess(s: ExecutionState): boolean {
  return SUCCESS_STATES.includes(s);
}

function edgeAllows(edge: WorkflowEdge, parentState: ExecutionState): boolean {
  const mode: EdgeActivation = edge.activation ?? 'always';
  if (mode === 'always') return isSuccess(parentState) || parentState === 'completed';
  if (mode === 'on_success') return parentState === 'completed' || parentState === 'skipped';
  if (mode === 'on_failure') return parentState === 'failed';
  return false;
}

export function buildExecutionGraph(workflow: Workflow): ExecutionGraph {
  const adjacency: Record<string, string[]> = {};
  const reverse: Record<string, string[]> = {};
  for (const n of workflow.nodes) {
    adjacency[n.id] = [];
    reverse[n.id] = [];
  }
  for (const e of workflow.edges) {
    if (!adjacency[e.source]) adjacency[e.source] = [];
    if (!reverse[e.target]) reverse[e.target] = [];
    adjacency[e.source].push(e.target);
    reverse[e.target].push(e.source);
  }
  const roots = workflow.nodes
    .filter((n) => (reverse[n.id] ?? []).length === 0)
    .map((n) => n.id);
  return { workflowId: workflow.id, roots, adjacency, reverse };
}

class ExecutionEngineImpl {
  private registered = false;
  /** Garde anti-réentrance par workflow */
  private propagating = new Set<string>();

  register(): void {
    if (this.registered) return;
    this.registered = true;

    EventBus.subscribe('TRIGGER_WORKFLOW_REQUESTED', (payload) => {
      const p = payload as { workflowId: string; startNodeId?: string };
      if (p?.workflowId) this.triggerWorkflow(p.workflowId, p.startNodeId);
    });

    EventBus.subscribe('RESET_WORKFLOW_EXECUTION', (payload) => {
      const p = payload as { workflowId: string };
      if (p?.workflowId) this.resetWorkflowExecution(p.workflowId);
    });

    EventBus.subscribe('COMPLETE_NODE_REQUESTED', (payload) => {
      const p = payload as { workflowId: string; nodeId: string };
      if (p?.workflowId && p?.nodeId) this.completeNode(p.workflowId, p.nodeId);
    });

    EventBus.subscribe('START_NODE_REQUESTED', (payload) => {
      const p = payload as { workflowId: string; nodeId: string };
      if (p?.workflowId && p?.nodeId) this.startNode(p.workflowId, p.nodeId);
    });

    // Nouvelle connexion → réévaluer cibles
    EventBus.subscribe(AppEvents.CONNECTION_CREATED, (payload) => {
      const p = payload as { workflowId: string; edge: WorkflowEdge };
      if (p?.workflowId && p?.edge) {
        this.evaluateNode(p.workflowId, p.edge.target);
      }
    });

    EventBus.subscribe(AppEvents.NODE_CREATED, (payload) => {
      const p = payload as { workflowId: string; node: WorkflowNode };
      if (p?.workflowId && p?.node) {
        this.evaluateNode(p.workflowId, p.node.id);
      }
    });
  }

  /** Construit le graphe d'exécution courant */
  getGraph(workflowId: string): ExecutionGraph | null {
    const wf = this.getWorkflow(workflowId);
    if (!wf) return null;
    return buildExecutionGraph(wf);
  }

  /**
   * Vérifie les parents en amont et met à jour Locked ↔ Ready.
   * Ne rétrograde pas un nœud déjà In_Progress / Completed / Failed.
   */
  evaluateNode(workflowId: string, nodeId: string): ExecutionState | null {
    const wf = this.getWorkflow(workflowId);
    if (!wf) return null;
    const node = wf.nodes.find((n) => n.id === nodeId);
    if (!node) return null;

    const graph = buildExecutionGraph(wf);
    const parentIds = graph.reverse[nodeId] ?? [];
    const current = node.executionState;

    // États terminaux / en cours : pas de re-lock automatique
    if (current === 'in_progress' || TERMINAL.includes(current)) {
      return current;
    }

    // Triggers / racines sans parents → Ready
    if (parentIds.length === 0) {
      const next: ExecutionState =
        node.type === 'trigger' || node.trigger?.kind !== 'none' ? 'ready' : 'ready';
      if (current !== next) this.setState(workflowId, nodeId, next);
      return next;
    }

    const parents = parentIds
      .map((id) => wf.nodes.find((n) => n.id === id))
      .filter(Boolean) as WorkflowNode[];

    const edges = wf.edges.filter((e) => e.target === nodeId);

    const parentSatisfied = (parent: WorkflowNode): boolean => {
      const edge = edges.find((e) => e.source === parent.id);
      if (!edge) return isSuccess(parent.executionState);
      return edgeAllows(edge, parent.executionState);
    };

    // Porte N→1 : AND = tous · OR = au moins un
    const strategy = resolveExecutionStrategy(node);
    const unlocked =
      strategy === 'OR'
        ? parents.some(parentSatisfied)
        : parents.every(parentSatisfied);

    const next: ExecutionState = unlocked ? 'ready' : 'locked';
    if (current !== next) {
      this.setState(workflowId, nodeId, next);
    }
    return next;
  }

  /**
   * Propagation 1→N : après completion d'un nœud, évalue
   * simultanément tous les enfants reliés (dispersion).
   */
  propagateToChildren(workflowId: string, sourceNodeId: string): void {
    this.propagate(workflowId, sourceNodeId);
  }

  /** Réévalue tous les nœuds d'un workflow (topo-ish) */
  evaluateAll(workflowId: string): void {
    const wf = this.getWorkflow(workflowId);
    if (!wf) return;
    const graph = buildExecutionGraph(wf);
    // BFS depuis racines
    const queue = [...graph.roots];
    const seen = new Set<string>();
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      this.evaluateNode(workflowId, id);
      for (const child of graph.adjacency[id] ?? []) {
        if (!seen.has(child)) queue.push(child);
      }
    }
    // Nœuds isolés non visités
    for (const n of wf.nodes) {
      if (!seen.has(n.id)) this.evaluateNode(workflowId, n.id);
    }
  }

  /**
   * Lance la chaîne d'exécution depuis un trigger / nœud de départ.
   */
  triggerWorkflow(workflowId: string, startNodeId?: string): void {
    const wf = this.getWorkflow(workflowId);
    if (!wf) return;

    const graph = buildExecutionGraph(wf);
    let startIds: string[] = [];

    if (startNodeId) {
      startIds = [startNodeId];
    } else {
      // Tous les triggers ready, sinon racines
      const triggers = wf.nodes.filter(
        (n) =>
          n.type === 'trigger' &&
          (n.executionState === 'ready' || n.executionState === 'locked')
      );
      startIds =
        triggers.length > 0
          ? triggers.map((t) => t.id)
          : graph.roots.length > 0
            ? graph.roots
            : wf.nodes.slice(0, 1).map((n) => n.id);
    }

    if (startIds.length === 0) {
      this.toast('warning', 'Aucun point d\'entrée', 'Ajoutez un nœud Trigger');
      return;
    }

    StateStore.updateWorkflow(workflowId, {
      runStatus: 'running',
      lastRunAt: new Date().toISOString(),
    });

    EventBus.publish(AppEvents.EXECUTION_STARTED, {
      workflowId,
      startNodeIds: startIds,
    });

    for (const id of startIds) {
      // Force ready puis start
      this.setState(workflowId, id, 'ready');
      this.startNode(workflowId, id);
      // Auto-complete triggers (point d'entrée symbolant)
      const node = this.getWorkflow(workflowId)?.nodes.find((n) => n.id === id);
      if (node?.type === 'trigger') {
        this.completeNode(workflowId, id);
      }
    }

    this.toast('success', 'Workflow démarré', wf.title);
  }

  /** Démarre l'exécution d'un nœud Ready */
  startNode(workflowId: string, nodeId: string): boolean {
    const wf = this.getWorkflow(workflowId);
    const node = wf?.nodes.find((n) => n.id === nodeId);
    if (!node) return false;

    // Réévalue d'abord
    const state = this.evaluateNode(workflowId, nodeId);
    if (state !== 'ready' && state !== 'in_progress') {
      if (node.type === 'trigger') {
        this.setState(workflowId, nodeId, 'in_progress', {
          startedAt: new Date().toISOString(),
        });
        return true;
      }
      this.toast('warning', 'Nœud verrouillé', node.label);
      return false;
    }

    this.setState(workflowId, nodeId, 'in_progress', {
      startedAt: new Date().toISOString(),
    });
    return true;
  }

  /** Marque Completed et propage aux enfants */
  completeNode(workflowId: string, nodeId: string): void {
    const wf = this.getWorkflow(workflowId);
    const node = wf?.nodes.find((n) => n.id === nodeId);
    if (!node) return;

    if (node.executionState === 'completed') {
      this.propagate(workflowId, nodeId);
      return;
    }

    this.setState(workflowId, nodeId, 'completed', {
      completedAt: new Date().toISOString(),
      status: 'completed',
    });

    this.emitPulses(workflowId, nodeId, 'success');
    this.propagate(workflowId, nodeId);
    this.refreshRunStatus(workflowId);
  }

  /** Marque Failed et propage (arêtes on_failure) */
  failNode(workflowId: string, nodeId: string): void {
    this.setState(workflowId, nodeId, 'failed', {
      completedAt: new Date().toISOString(),
      status: 'failed',
    });
    this.emitPulses(workflowId, nodeId, 'failure');
    this.propagate(workflowId, nodeId);
    this.refreshRunStatus(workflowId);
  }

  /** Ignore le nœud et propage comme succès soft */
  skipNode(workflowId: string, nodeId: string): void {
    this.setState(workflowId, nodeId, 'skipped', {
      completedAt: new Date().toISOString(),
      status: 'skipped',
    });
    this.emitPulses(workflowId, nodeId, 'activate');
    this.propagate(workflowId, nodeId);
    this.refreshRunStatus(workflowId);
  }

  /**
   * Remet l'ensemble des nœuds à l'état initial.
   * Triggers / racines → Ready ; autres → Locked puis evaluate.
   */
  resetWorkflowExecution(workflowId: string): void {
    const wf = this.getWorkflow(workflowId);
    if (!wf) return;

    const graph = buildExecutionGraph(wf);

    for (const node of wf.nodes) {
      const isRoot = (graph.reverse[node.id] ?? []).length === 0;
      const next: ExecutionState =
        node.type === 'trigger' || isRoot ? 'ready' : 'locked';
      StateStore.patchNodeSoft(workflowId, node.id, {
        executionState: next,
        status: next,
        startedAt: null,
        completedAt: null,
      });
    }

    StateStore.updateWorkflow(workflowId, {
      runStatus: 'idle',
    });

    // Réévalue pour cohérence joinMode
    this.evaluateAll(workflowId);

    EventBus.publish(AppEvents.EXECUTION_RESET, { workflowId });
    this.toast('info', 'Exécution réinitialisée', wf.title);
  }

  /** Propagation cascade avec garde anti-boucle */
  private propagate(workflowId: string, fromNodeId: string): void {
    const key = `${workflowId}:${fromNodeId}`;
    if (this.propagating.has(key)) return;
    this.propagating.add(key);

    try {
      const wf = this.getWorkflow(workflowId);
      if (!wf) return;
      const graph = buildExecutionGraph(wf);
      const children = graph.adjacency[fromNodeId] ?? [];
      const visited = new Set<string>([fromNodeId]);

      const queue = [...children];
      while (queue.length) {
        const childId = queue.shift()!;
        if (visited.has(childId)) continue; // cycle guard
        visited.add(childId);

        const prev = wf.nodes.find((n) => n.id === childId)?.executionState;
        const next = this.evaluateNode(workflowId, childId);

        EventBus.publish(AppEvents.NODE_PROPAGATED, {
          workflowId,
          fromNodeId,
          nodeId: childId,
          previous: prev,
          next,
        });

        // Si enfant auto-ready et type output → ne pas auto-start
        // Propager plus loin seulement si déjà terminal
        const child = this.getWorkflow(workflowId)?.nodes.find((n) => n.id === childId);
        if (child && TERMINAL.includes(child.executionState)) {
          for (const grand of graph.adjacency[childId] ?? []) {
            if (!visited.has(grand)) queue.push(grand);
          }
        }
      }
    } finally {
      this.propagating.delete(key);
    }
  }

  private emitPulses(
    workflowId: string,
    sourceNodeId: string,
    kind: FlowPulse['kind']
  ): void {
    const wf = this.getWorkflow(workflowId);
    if (!wf) return;
    const edges = wf.edges.filter((e) => e.source === sourceNodeId);
    for (const edge of edges) {
      const pulse: FlowPulse = {
        id: uid('pulse'),
        edgeId: edge.id,
        workflowId,
        createdAt: Date.now(),
        kind,
      };
      EventBus.publish(AppEvents.FLOW_PULSE, pulse);
    }
  }

  private setState(
    workflowId: string,
    nodeId: string,
    executionState: ExecutionState,
    extra: Partial<WorkflowNode> = {}
  ): void {
    const prev = this.getWorkflow(workflowId)?.nodes.find((n) => n.id === nodeId)
      ?.executionState;

    StateStore.patchNodeSoft(workflowId, nodeId, {
      executionState,
      status: executionState,
      ...extra,
    });

    EventBus.publish(AppEvents.NODE_STATE_CHANGED, {
      workflowId,
      nodeId,
      previous: prev,
      executionState,
    });
  }

  private refreshRunStatus(workflowId: string): void {
    const wf = this.getWorkflow(workflowId);
    if (!wf) return;

    const states = wf.nodes.map((n) => n.executionState);
    if (states.some((s) => s === 'failed')) {
      StateStore.updateWorkflow(workflowId, { runStatus: 'failed' });
      return;
    }
    if (states.some((s) => s === 'in_progress' || s === 'ready')) {
      // still running if any in progress; ready alone may mean waiting
      if (states.some((s) => s === 'in_progress')) {
        StateStore.updateWorkflow(workflowId, { runStatus: 'running' });
      }
      return;
    }
    if (states.length && states.every((s) => TERMINAL.includes(s))) {
      StateStore.updateWorkflow(workflowId, { runStatus: 'completed' });
      EventBus.publish(AppEvents.EXECUTION_COMPLETED, { workflowId });
    }
  }

  private getWorkflow(workflowId: string): Workflow | undefined {
    return StateStore.getState().workflows.find((w) => w.id === workflowId);
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
      duration: 2600,
    });
  }
}

export const ExecutionEngine = new ExecutionEngineImpl();
export default ExecutionEngine;
