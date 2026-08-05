/**
 * FlowMind — UniversalConverter
 * Matrice de conversion inter-modules sans perte de données
 * Équipe MILMA Entreprise
 */

import { EventBus } from './EventBus';
import { StateStore, uid } from './StateStore';
import { NoteManager } from './NoteManager';
import { TodoManager } from './TodoManager';
import { CalendarManager } from './CalendarManager';
import { WorkflowEngine } from './WorkflowEngine';
import { CaptureService } from './CaptureService';
import {
  AppEvents,
  CONVERSION_MATRIX,
  ENTITY_LABELS,
  type BrainDumpItem,
  type CalendarEvent,
  type ConversionExtraConfig,
  type ConversionResult,
  type Note,
  type Subtask,
  type TodoItem,
  type TodoList,
  type UniversalEntityType,
  type UniversalPayload,
  type WorkflowNode,
} from './Types';

function toast(
  type: 'success' | 'info' | 'error' | 'warning',
  title: string,
  description?: string
) {
  EventBus.publish(AppEvents.TOAST_SHOW, {
    id: uid('toast'),
    type,
    title,
    description,
    duration: 2800,
  });
}

function asRecord(data: unknown): Record<string, unknown> {
  if (data && typeof data === 'object') return data as Record<string, unknown>;
  return {};
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

class UniversalConverterImpl {
  /** Vérifie si une conversion est autorisée */
  canConvert(source: UniversalEntityType, target: UniversalEntityType): boolean {
    if (source === target) return true;
    return (CONVERSION_MATRIX[source] ?? []).includes(target);
  }

  /**
   * Transforme une entité source vers une cible.
   * extraConfig.preview = true → ne persiste pas, retourne preview.
   */
  convertEntity(
    sourceType: UniversalEntityType,
    targetType: UniversalEntityType,
    sourceData: Record<string, unknown> | UniversalPayload,
    extraConfig: ConversionExtraConfig = {}
  ): ConversionResult {
    const data =
      'data' in sourceData && sourceData.version === 1
        ? (sourceData as UniversalPayload).data
        : asRecord(sourceData);

    if (!this.canConvert(sourceType, targetType)) {
      const error = `Conversion ${sourceType} → ${targetType} non supportée`;
      toast('error', 'Conversion impossible', error);
      return { ok: false, sourceType, targetType, error };
    }

    try {
      if (extraConfig.preview) {
        const preview = this.buildPreview(sourceType, targetType, data, extraConfig);
        return { ok: true, sourceType, targetType, preview };
      }

      const result = this.execute(sourceType, targetType, data, extraConfig);

      if (result.ok) {
        EventBus.publish(AppEvents.ENTITY_CONVERTED, result);
        EventBus.publish(AppEvents.CROSS_FEATURE_TRANSFORM, {
          ...result,
          sourceData: data,
          extraConfig,
        });
        toast(
          'success',
          'Transformation réussie',
          `${ENTITY_LABELS[sourceType]} → ${ENTITY_LABELS[targetType]}`
        );

        if (extraConfig.removeSource) {
          this.removeSource(sourceType, str(data.id));
        }
      }

      return result;
    } catch (err) {
      const error = String(err);
      EventBus.publish(AppEvents.ERROR, {
        source: 'UniversalConverter',
        error,
      });
      toast('error', 'Échec conversion', error);
      return { ok: false, sourceType, targetType, error };
    }
  }

  /** Convertit depuis un UniversalPayload (drop) */
  convertPayload(
    payload: UniversalPayload,
    targetType: UniversalEntityType,
    extraConfig: ConversionExtraConfig = {}
  ): ConversionResult {
    return this.convertEntity(
      payload.sourceType,
      targetType,
      payload.data,
      extraConfig
    );
  }

  private execute(
    sourceType: UniversalEntityType,
    targetType: UniversalEntityType,
    data: Record<string, unknown>,
    cfg: ConversionExtraConfig
  ): ConversionResult {
    switch (targetType) {
      case 'note':
        return this.toNote(sourceType, data, cfg);
      case 'todo_item':
        return this.toTodoItem(sourceType, data, cfg);
      case 'calendar_event':
        return this.toCalendarEvent(sourceType, data, cfg);
      case 'workflow_node':
        return this.toWorkflowNode(sourceType, data, cfg);
      case 'brain_dump':
        return this.toBrainDump(sourceType, data, cfg);
      case 'todo_list':
        return this.toTodoList(sourceType, data, cfg);
      default:
        return {
          ok: false,
          sourceType,
          targetType,
          error: 'Cible inconnue',
        };
    }
  }

  // ─── Vers Note ────────────────────────────────────────

  private toNote(
    sourceType: UniversalEntityType,
    data: Record<string, unknown>,
    cfg: ConversionExtraConfig
  ): ConversionResult {
    const { title, content, tags } = this.extractText(sourceType, data);
    const note = NoteManager.create({
      title: cfg.title || title,
      content,
      tags,
      folderId: cfg.folderId ?? 'folder_inbox',
    });
    StateStore.setActiveNoteId(note.id);
    return {
      ok: true,
      sourceType,
      targetType: 'note',
      createdId: note.id,
    };
  }

  // ─── Vers Todo ────────────────────────────────────────

  private toTodoItem(
    sourceType: UniversalEntityType,
    data: Record<string, unknown>,
    cfg: ConversionExtraConfig
  ): ConversionResult {
    const { title } = this.extractText(sourceType, data);
    let listId = cfg.listId;
    if (!listId) {
      const list = TodoManager.ensureInboxList();
      listId = list.id;
    }
    const due =
      str(data.dueDate) ||
      str(data.start) ||
      str(data.startDate) ||
      null;
    const item = TodoManager.addItem(listId, {
      text: cfg.title || title,
      priority: this.mapPriority(data.priority),
      dueDate: due,
    });
    return {
      ok: true,
      sourceType,
      targetType: 'todo_item',
      createdId: item?.id,
    };
  }

  private toTodoList(
    sourceType: UniversalEntityType,
    data: Record<string, unknown>,
    _cfg: ConversionExtraConfig
  ): ConversionResult {
    const { title, content } = this.extractText(sourceType, data);
    const list = TodoManager.createList({
      title,
      category: 'Import',
    });
    // Lignes de contenu → items
    const lines = content
      .split('\n')
      .map((l) => l.replace(/^[-*]\s+/, '').trim())
      .filter(Boolean)
      .slice(0, 30);
    for (const line of lines) {
      if (line === title) continue;
      TodoManager.addItem(list.id, { text: line.slice(0, 200) });
    }
    return {
      ok: true,
      sourceType,
      targetType: 'todo_list',
      createdId: list.id,
    };
  }

  // ─── Vers Calendrier ──────────────────────────────────

  private toCalendarEvent(
    sourceType: UniversalEntityType,
    data: Record<string, unknown>,
    cfg: ConversionExtraConfig
  ): ConversionResult {
    const { title, content } = this.extractText(sourceType, data);
    const duration = cfg.durationMinutes ?? 60;
    let start: Date;
    if (cfg.start) {
      start = new Date(cfg.start);
    } else if (data.dueDate || data.start || data.startDate) {
      start = new Date(
        str(data.dueDate) || str(data.start) || str(data.startDate)
      );
    } else {
      start = new Date();
      start.setMinutes(0, 0, 0);
      start.setHours(start.getHours() + 1);
    }
    const end = cfg.end
      ? new Date(cfg.end)
      : new Date(start.getTime() + duration * 60 * 1000);

    const event = CalendarManager.saveEvent({
      title: cfg.title || title,
      description: content,
      start: start.toISOString(),
      end: end.toISOString(),
      color: str(data.color, '#818cf8'),
      linkedNodeId:
        sourceType === 'workflow_node' ? str(data.id) || null : null,
      linkedWorkflowId:
        sourceType === 'workflow_node'
          ? str(data.workflowId) || cfg.workflowId || null
          : null,
    });

    return {
      ok: true,
      sourceType,
      targetType: 'calendar_event',
      createdId: event.id,
    };
  }

  // ─── Vers Workflow Node ───────────────────────────────

  private toWorkflowNode(
    sourceType: UniversalEntityType,
    data: Record<string, unknown>,
    cfg: ConversionExtraConfig
  ): ConversionResult {
    const { title, content, tags } = this.extractText(sourceType, data);
    const state = StateStore.getState();
    let workflowId = cfg.workflowId || state.ui.activeWorkflowId;

    if (!workflowId || !state.workflows.some((w) => w.id === workflowId)) {
      const wf = WorkflowEngine.createWorkflow(
        sourceType === 'note' ? `Depuis note` : 'Import Cross-Feature'
      );
      workflowId = wf.id;
    }

    // Sous-tâches depuis node ou lignes markdown
    const subtasks = this.extractSubtasks(sourceType, data, content);

    const node = WorkflowEngine.addNode(workflowId, {
      type: cfg.nodeType || 'action',
      label: (cfg.title || title).slice(0, 80),
      description: content.slice(0, 2000),
      data: {
        fromUniversal: true,
        sourceType,
        sourceId: str(data.id),
        tags,
      },
    });

    if (node && subtasks.length) {
      StateStore.patchNodeSoft(workflowId, node.id, {
        subtasks,
        progress: 0,
      });
    }

    StateStore.setActiveZone('workflows');
    WorkflowEngine.selectWorkflow(workflowId);
    if (node) WorkflowEngine.selectNode(node.id);

    return {
      ok: true,
      sourceType,
      targetType: 'workflow_node',
      createdId: node?.id,
    };
  }

  // ─── Vers Brain Dump ──────────────────────────────────

  private toBrainDump(
    sourceType: UniversalEntityType,
    data: Record<string, unknown>,
    cfg: ConversionExtraConfig
  ): ConversionResult {
    const { title, content, tags } = this.extractText(sourceType, data);
    const tagStr = tags.map((t) => `#${t}`).join(' ');
    const body = [cfg.title || title, content, tagStr].filter(Boolean).join('\n');
    const item = CaptureService.add(body, { source: 'import' });
    StateStore.setActiveZone('braindump');
    return {
      ok: true,
      sourceType,
      targetType: 'brain_dump',
      createdId: item?.id,
    };
  }

  // ─── Extraction texte ─────────────────────────────────

  private extractText(
    sourceType: UniversalEntityType,
    data: Record<string, unknown>
  ): { title: string; content: string; tags: string[] } {
    switch (sourceType) {
      case 'note': {
        const title = str(data.title, 'Sans titre');
        const content = str(data.content);
        const tags = Array.isArray(data.tags)
          ? (data.tags as string[])
          : [];
        return { title, content, tags };
      }
      case 'todo_item': {
        const title = str(data.text) || str(data.title, 'Unité');
        return { title, content: title, tags: [] };
      }
      case 'todo_list': {
        const title = str(data.title, 'Liste');
        const items = Array.isArray(data.items) ? (data.items as TodoItem[]) : [];
        const content = items
          .map((i) => `- [${i.isCompleted ? 'x' : ' '}] ${i.text}`)
          .join('\n');
        return { title, content, tags: [str(data.category, 'liste').toLowerCase()] };
      }
      case 'brain_dump': {
        const content = str(data.content) || str(data.plainText);
        const title = content.split('\n')[0]?.slice(0, 80) || 'Capture';
        const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
        return { title, content: str(data.plainText) || content, tags };
      }
      case 'calendar_event': {
        const title = str(data.title, 'Événement');
        const content = str(data.description);
        return { title, content, tags: [] };
      }
      case 'workflow_node': {
        const title = str(data.label) || str(data.title, 'Nœud');
        const desc = str(data.description);
        const subs = Array.isArray(data.subtasks)
          ? (data.subtasks as Subtask[])
          : [];
        const bullets = subs
          .map((s) => `- [${s.done ? 'x' : ' '}] ${s.title}`)
          .join('\n');
        const content = [desc, bullets].filter(Boolean).join('\n\n');
        return { title, content, tags: [] };
      }
      default:
        return { title: 'Élément', content: '', tags: [] };
    }
  }

  private extractSubtasks(
    sourceType: UniversalEntityType,
    data: Record<string, unknown>,
    content: string
  ): Subtask[] {
    if (sourceType === 'workflow_node' && Array.isArray(data.subtasks)) {
      return (data.subtasks as Subtask[]).map((s, i) => ({
        ...s,
        id: uid('sub'),
        order: i,
      }));
    }
    if (sourceType === 'todo_list' && Array.isArray(data.items)) {
      return (data.items as TodoItem[]).map((it, i) => ({
        id: uid('sub'),
        title: it.text,
        done: it.isCompleted,
        order: i,
        createdAt: new Date().toISOString(),
        completedAt: it.completedAt,
      }));
    }
    // Lignes markdown - item
    const lines = content
      .split('\n')
      .map((l) => l.match(/^[-*]\s+(?:\[[ xX]\]\s*)?(.+)/))
      .filter(Boolean) as RegExpMatchArray[];
    return lines.slice(0, 20).map((m, i) => ({
      id: uid('sub'),
      title: m[1].trim(),
      done: false,
      order: i,
      createdAt: new Date().toISOString(),
      completedAt: null,
    }));
  }

  private mapPriority(
    p: unknown
  ): 'low' | 'medium' | 'high' {
    if (p === 'high' || p === 'critical') return 'high';
    if (p === 'low') return 'low';
    return 'medium';
  }

  private buildPreview(
    sourceType: UniversalEntityType,
    targetType: UniversalEntityType,
    data: Record<string, unknown>,
    cfg: ConversionExtraConfig
  ): Record<string, unknown> {
    const { title, content, tags } = this.extractText(sourceType, data);
    return {
      sourceType,
      targetType,
      title: cfg.title || title,
      content: content.slice(0, 400),
      tags,
      needsTime: targetType === 'calendar_event' && !cfg.start,
      needsWorkflow: targetType === 'workflow_node' && !cfg.workflowId,
    };
  }

  private removeSource(sourceType: UniversalEntityType, id: string): void {
    if (!id) return;
    switch (sourceType) {
      case 'note':
        NoteManager.deleteNote(id);
        break;
      case 'brain_dump':
        CaptureService.remove(id);
        break;
      case 'calendar_event':
        CalendarManager.deleteEvent(id);
        break;
      case 'todo_list':
        TodoManager.deleteList(id);
        break;
      default:
        break;
    }
  }

  /** Construit un payload drag depuis une entité live */
  buildPayload(
    sourceType: UniversalEntityType,
    sourceModule: string,
    entity: Note | TodoItem | TodoList | BrainDumpItem | CalendarEvent | WorkflowNode,
    extra: Record<string, unknown> = {}
  ): UniversalPayload {
    const data = { ...entity, ...extra } as unknown as Record<string, unknown>;
    const { title } = this.extractText(sourceType, data);
    return {
      version: 1,
      sourceType,
      sourceModule,
      sourceId: str(data.id),
      data,
      label: title,
      draggedAt: new Date().toISOString(),
    };
  }
}

export const UniversalConverter = new UniversalConverterImpl();
export default UniversalConverter;
