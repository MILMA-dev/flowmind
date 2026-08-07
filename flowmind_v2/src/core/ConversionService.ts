/**
 * FlowMind — ConversionService
 * Moteur de conversion multi-cibles (Brain Dump → Zones)
 * Équipe MILMA Entreprise
 *
 * ZÉRO COUPLAGE UI : communique uniquement via EventBus + StateStore.
 * Les vues se mettent à jour en réaction aux événements publiés.
 */

import { EventBus } from './EventBus';
import { StateStore, uid, normalizeNode } from './StateStore';
import {
  AppEvents,
  CONVERSION_LABELS,
  type BrainDumpItem,
  type CalendarEvent,
  type ConversionPayload,
  type ConversionTarget,
  type Note,
  type Task,
  type Workflow,
  type WorkflowNode,
} from './Types';
import { deriveTitle, toTaskPriority } from './textParse';

export interface ConversionResult {
  ok: boolean;
  createdId?: string;
  targetType?: ConversionTarget;
  error?: string;
}

class ConversionServiceImpl {
  private registered = false;

  /** Enregistre les listeners du bus (bootstrap main) */
  register(): void {
    if (this.registered) return;
    this.registered = true;

    EventBus.subscribe('CONVERT_CAPTURE_REQUESTED', (payload) => {
      const p = payload as {
        itemId: string;
        targetType: ConversionTarget;
        targetPayload?: ConversionPayload;
      };
      if (p?.itemId && p?.targetType) {
        this.convertItem(p.itemId, p.targetType, p.targetPayload);
      }
    });
  }

  /**
   * Convertit une Capture Unit vers une Zone cible.
   * Émet les événements de création puis BRAIN_DUMP_ITEM_CONVERTED.
   */
  convertItem(
    itemId: string,
    targetType: ConversionTarget,
    targetPayload: ConversionPayload = {}
  ): ConversionResult {
    const state = StateStore.getState();
    const item = state.captures.find((c) => c.id === itemId);

    if (!item) {
      const error = `Capture Unit introuvable: ${itemId}`;
      EventBus.publish(AppEvents.ERROR, { source: 'ConversionService', error });
      this.toast('error', 'Conversion impossible', error);
      return { ok: false, error };
    }

    if (item.status === 'converted' || item.status === 'discarded') {
      const error = 'Cette Capture Unit a déjà été traitée';
      this.toast('warning', 'Déjà traitée', error);
      return { ok: false, error };
    }

    try {
      let createdId: string;

      switch (targetType) {
        case 'note':
          createdId = this.toNote(item, targetPayload);
          break;
        case 'task':
          createdId = this.toTask(item, targetPayload);
          break;
        case 'event':
          createdId = this.toEvent(item, targetPayload);
          break;
        case 'workflow':
          createdId = this.toWorkflowNode(item, targetPayload);
          break;
        default:
          return { ok: false, error: `Cible inconnue: ${targetType as string}` };
      }

      const remove =
        targetPayload.removeFromInbox ?? state.ui.removeCaptureOnConvert ?? true;

      // Marque / retire via le store (la vue réagit — pas de nettoyage manuel UI)
      StateStore.markCaptureConverted(itemId, targetType, createdId, remove);

      EventBus.publish(AppEvents.BRAIN_DUMP_ITEM_CONVERTED, {
        itemId,
        targetType,
        createdId,
        item: { ...item, status: 'converted', route: targetType, routedToId: createdId },
      });

      EventBus.publish(AppEvents.CAPTURE_PROCESSED, {
        itemId,
        targetType,
        createdId,
      });

      this.toast(
        'success',
        'Idée convertie avec succès',
        `→ ${CONVERSION_LABELS[targetType]}`
      );

      return { ok: true, createdId, targetType };
    } catch (err) {
      const error = String(err);
      EventBus.publish(AppEvents.ERROR, { source: 'ConversionService.convertItem', error });
      this.toast('error', 'Échec de conversion', error);
      return { ok: false, error };
    }
  }

  // ─── Transformateurs privés ────────────────────────────

  private toNote(item: BrainDumpItem, payload: ConversionPayload): string {
    const now = new Date().toISOString();
    const title = payload.title || deriveTitle(item.content);
    const note: Note = {
      id: uid('note'),
      title,
      content: item.plainText || item.content,
      folderId: payload.folderId ?? 'folder_inbox',
      tags: [...item.tags],
      pinned: false,
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    };

    EventBus.publish(AppEvents.CREATE_NOTE_REQUESTED, { note, fromCaptureId: item.id });
    StateStore.addNote(note);
    EventBus.publish(AppEvents.NOTE_CREATED, { note });
    return note.id;
  }

  private toTask(item: BrainDumpItem, payload: ConversionPayload): string {
    const now = new Date().toISOString();
    const title = payload.title || deriveTitle(item.content);
    const task: Task = {
      id: uid('task'),
      title,
      description: item.plainText || item.content,
      status: 'inbox',
      priority: payload.priority ?? toTaskPriority(item.priority),
      dueDate: null,
      projectId: null,
      tags: [...item.tags],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };

    EventBus.publish(AppEvents.CREATE_TASK_REQUESTED, { task, fromCaptureId: item.id });
    StateStore.addTask(task);
    EventBus.publish(AppEvents.TASK_CREATED, { task });
    return task.id;
  }

  private toEvent(item: BrainDumpItem, payload: ConversionPayload): string {
    const now = new Date();
    const start = payload.start
      ? new Date(payload.start)
      : new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0);
    const end = payload.end
      ? new Date(payload.end)
      : new Date(start.getTime() + 60 * 60 * 1000);

    const title = payload.title || deriveTitle(item.content);
    const event: CalendarEvent = {
      id: uid('evt'),
      title,
      description: item.plainText || item.content,
      start: start.toISOString(),
      end: end.toISOString(),
      allDay: false,
      color: '#818cf8',
      linkedTaskId: null,
      linkedNoteId: null,
      linkedNodeId: null,
      linkedWorkflowId: null,
      triggerFiredAt: null,
      createdAt: now.toISOString(),
    };

    EventBus.publish(AppEvents.CREATE_EVENT_REQUESTED, { event, fromCaptureId: item.id });
    StateStore.addEvent(event);
    EventBus.publish(AppEvents.EVENT_CREATED, { event });
    return event.id;
  }

  private toWorkflowNode(item: BrainDumpItem, payload: ConversionPayload): string {
    const state = StateStore.getState();
    let workflow: Workflow | undefined;

    if (payload.workflowId) {
      workflow = state.workflows.find((w) => w.id === payload.workflowId);
    }
    if (!workflow && state.workflows.length > 0) {
      // Workflow le plus récemment mis à jour
      workflow = [...state.workflows].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0];
    }

    const now = new Date().toISOString();
    const label = payload.title || deriveTitle(item.content, 48);

    // Crée un workflow d'inbox si aucun n'existe
    if (!workflow) {
      const node = normalizeNode({
        id: uid('node'),
        type: 'action',
        label,
        x: 200,
        y: 160,
        description: item.plainText || item.content,
        data: {
          fromCaptureId: item.id,
          content: item.plainText || item.content,
          tags: item.tags,
        },
      });
      workflow = {
        id: uid('wf'),
        title: 'Inbox Workflow',
        description: 'Créé automatiquement depuis le Système de Capture Unit',
        nodes: [node],
        edges: [],
        tags: [...item.tags],
        color: '#6366f1',
        createdAt: now,
        updatedAt: now,
      };
      EventBus.publish(AppEvents.CREATE_NODE_REQUESTED, {
        node,
        workflowId: workflow.id,
        fromCaptureId: item.id,
        createdWorkflow: true,
      });
      StateStore.addWorkflow(workflow);
      EventBus.publish(AppEvents.NODE_CREATED, { node, workflowId: workflow.id });
      EventBus.publish(AppEvents.WORKFLOW_UPDATED, { workflows: StateStore.getState().workflows });
      return node.id;
    }

    // Offset pour éviter la superposition
    const offset = workflow.nodes.length * 40;
    const node = normalizeNode({
      id: uid('node'),
      type: 'action',
      label,
      x: 180 + (offset % 320),
      y: 120 + Math.floor(offset / 8) * 80,
      description: item.plainText || item.content,
      data: {
        fromCaptureId: item.id,
        content: item.plainText || item.content,
        tags: item.tags,
      },
    });

    EventBus.publish(AppEvents.CREATE_NODE_REQUESTED, {
      node,
      workflowId: workflow.id,
      fromCaptureId: item.id,
    });
    StateStore.addNodeToWorkflow(workflow.id, node);
    EventBus.publish(AppEvents.NODE_CREATED, { node, workflowId: workflow.id });
    return node.id;
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
      duration: 3200,
    });
  }
}

/** Singleton du service de conversion */
export const ConversionService = new ConversionServiceImpl();
export default ConversionService;
