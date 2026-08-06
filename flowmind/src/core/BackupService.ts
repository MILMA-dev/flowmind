/**
 * FlowMind — BackupService
 * Export / Import JSON + validation schéma
 * Compatible PWA / Capacitor / Electron (download + File API)
 * Équipe MILMA Entreprise
 */

import { EventBus } from './EventBus';
import { StateStore, uid, createInitialState } from './StateStore';
import { StorageRepository } from '../infrastructure/StorageRepository';
import {
  AppEvents,
  type AppState,
  type BackupSchema,
  type Workflow,
  type WorkflowExportSchema,
  type WorkflowEdge,
  type WorkflowNode,
} from './Types';
import { WorkflowEngine } from './WorkflowEngine';
import { normalizeNode } from './StateStore';

const BACKUP_FORMAT = 'flowmind-backup';
const BACKUP_VERSION = 1;
const APP_VERSION = '1.0.0';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  data?: BackupSchema;
}

function simpleChecksum(json: string): string {
  let h = 0;
  for (let i = 0; i < json.length; i++) {
    h = (Math.imul(31, h) + json.charCodeAt(i)) | 0;
  }
  return `fm_${(h >>> 0).toString(16)}`;
}

class BackupServiceImpl {
  /**
   * Valide la structure d'un backup JSON
   */
  validate(raw: unknown): ValidationResult {
    const errors: string[] = [];
    if (!raw || typeof raw !== 'object') {
      return { ok: false, errors: ['Fichier invalide : JSON objet requis'] };
    }
    const obj = raw as Record<string, unknown>;

    if (obj.format !== BACKUP_FORMAT) {
      // Accepte aussi un dump d'état brut (AppState)
      if (obj.version && obj.ui && Array.isArray(obj.workflows)) {
        const wrapped: BackupSchema = {
          format: BACKUP_FORMAT,
          version: BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          appVersion: APP_VERSION,
          state: obj as unknown as AppState,
        };
        return { ok: true, errors: [], data: wrapped };
      }
      errors.push(`format attendu "${BACKUP_FORMAT}"`);
    }

    if (!obj.state || typeof obj.state !== 'object') {
      errors.push('champ "state" manquant');
    } else {
      const st = obj.state as Record<string, unknown>;
      if (!st.ui) errors.push('state.ui manquant');

      if (!Array.isArray(st.workflows)) {
        errors.push('state.workflows doit être un tableau');
      } else {
        st.workflows.forEach((w: unknown, idx: number) => {
          if (!w || typeof w !== 'object') {
            errors.push(`state.workflows[${idx}] doit être un objet`);
          }
        });
      }

      if (!Array.isArray(st.notes)) {
        errors.push('state.notes doit être un tableau');
      } else {
        st.notes.forEach((n: unknown, idx: number) => {
          if (!n || typeof n !== 'object') {
            errors.push(`state.notes[${idx}] doit être un objet`);
          }
        });
      }

      if (!Array.isArray(st.events)) {
        errors.push('state.events doit être un tableau');
      } else {
        st.events.forEach((e: unknown, idx: number) => {
          if (!e || typeof e !== 'object') {
            errors.push(`state.events[${idx}] doit être un objet`);
          }
        });
      }

      if (!Array.isArray(st.captures)) {
        errors.push('state.captures doit être un tableau');
      } else {
        st.captures.forEach((c: unknown, idx: number) => {
          if (!c || typeof c !== 'object') {
            errors.push(`state.captures[${idx}] doit être un objet`);
          }
        });
      }
    }

    if (errors.length) return { ok: false, errors };

    return { ok: true, errors: [], data: obj as unknown as BackupSchema };
  }

  /** Construit le payload de backup depuis le StateStore */
  buildBackup(): BackupSchema {
    const state = StateStore.getState();
    const payload: BackupSchema = {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      state: {
        ...state,
        ui: {
          ...state.ui,
          quickCaptureOpen: false,
          settingsOpen: false,
          inspectorOpen: false,
        },
      },
    };
    const json = JSON.stringify(payload);
    payload.checksum = simpleChecksum(json.replace(/"checksum":"[^"]*",?/, ''));
    return payload;
  }

  /**
   * Exporte et télécharge flowmind-backup-[DATE].json
   */
  async exportData(): Promise<{ filename: string; bytes: number }> {
    await StateStore.flush();
    const backup = this.buildBackup();
    const json = JSON.stringify(backup, null, 2);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `flowmind-backup-${date}.json`;

    // File System Access API si dispo (Chromium / Electron)
    if ('showSaveFilePicker' in window) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: 'FlowMind Backup',
              accept: { 'application/json': ['.json'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        EventBus.publish(AppEvents.SYSTEM_EXPORTED, { filename, bytes: json.length });
        this.toast('success', 'Sauvegarde exportée', filename);
        return { filename, bytes: json.length };
      } catch (err) {
        // User cancel → fallback download
        if ((err as Error)?.name === 'AbortError') {
          return { filename, bytes: 0 };
        }
      }
    }

    // Fallback <a download>
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    EventBus.publish(AppEvents.SYSTEM_EXPORTED, { filename, bytes: json.length });
    this.toast('success', 'Sauvegarde téléchargée', filename);
    return { filename, bytes: json.length };
  }

  /**
   * Importe un fichier JSON, valide et restaure le StateStore
   */
  async importData(jsonFile: File | string): Promise<ValidationResult> {
    try {
      const text =
        typeof jsonFile === 'string' ? jsonFile : await jsonFile.text();
      const parsed = JSON.parse(text) as unknown;
      const validation = this.validate(parsed);
      if (!validation.ok || !validation.data) {
        this.toast('error', 'Import refusé', validation.errors.join(' · '));
        return validation;
      }

      const incoming = validation.data.state;
      const base = createInitialState();
      const merged: AppState = {
        ...base,
        ...incoming,
        version: Math.max(base.version, incoming.version ?? 1),
        ui: {
          ...base.ui,
          ...incoming.ui,
          quickCaptureOpen: false,
          settingsOpen: false,
          inspectorOpen: false,
          selectedNodeId: null,
        },
      };

      // Persiste puis hydrate
      await StorageRepository.save(merged);
      StateStore.hydrate();

      EventBus.publish(AppEvents.SYSTEM_RESTORED, {
        at: new Date().toISOString(),
        from: validation.data.exportedAt,
      });
      this.toast('success', 'Système restauré', 'Données rechargées');
      return validation;
    } catch (err) {
      const errors = [`Parse JSON : ${String(err)}`];
      this.toast('error', 'Import échoué', errors[0]);
      return { ok: false, errors };
    }
  }

  /** Estimation stockage local */
  getStorageStats(): {
    usedBytes: number;
    quotaBytes: number | null;
    itemCount: number;
    breakdown: Record<string, number>;
  } {
    const state = StateStore.getState();
    const json = JSON.stringify(state);
    const breakdown = {
      workflows: state.workflows.length,
      notes: state.notes.length,
      tasks: state.tasks.length,
      todoLists: state.todoLists.length,
      events: state.events.length,
      captures: state.captures.length,
    };
    return {
      usedBytes: json.length,
      quotaBytes: null,
      itemCount: Object.values(breakdown).reduce((a, b) => a + b, 0),
      breakdown,
    };
  }

  async getQuota(): Promise<{ usage: number; quota: number } | null> {
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        return {
          usage: est.usage ?? 0,
          quota: est.quota ?? 0,
        };
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  /** Reset usine */
  async resetAll(): Promise<void> {
    await StorageRepository.clear();
    StateStore.hydrate();
    EventBus.publish(AppEvents.SYSTEM_RESTORED, {
      at: new Date().toISOString(),
      reset: true,
    });
    this.toast('info', 'Réinitialisation', 'État d\'usine restauré');
  }

  // ─── Export / Import Workflow isolé (.flowmind.json) ──

  validateWorkflowExport(raw: unknown): {
    ok: boolean;
    errors: string[];
    data?: WorkflowExportSchema;
  } {
    const errors: string[] = [];
    if (!raw || typeof raw !== 'object') {
      return { ok: false, errors: ['JSON objet requis'] };
    }
    const obj = raw as Record<string, unknown>;

    // Accepte { format, workflow } ou workflow brut
    let workflow: unknown = obj.workflow;
    if (!workflow && obj.nodes && obj.edges) {
      workflow = obj;
    }
    if (!workflow || typeof workflow !== 'object') {
      errors.push('champ workflow manquant');
      return { ok: false, errors };
    }
    const wf = workflow as Record<string, unknown>;
    if (!Array.isArray(wf.nodes)) errors.push('workflow.nodes doit être un tableau');
    if (!Array.isArray(wf.edges)) errors.push('workflow.edges doit être un tableau');
    if (errors.length) return { ok: false, errors };

    const data: WorkflowExportSchema = {
      format: 'flowmind-workflow',
      version: typeof obj.version === 'number' ? obj.version : 1,
      exportedAt:
        typeof obj.exportedAt === 'string'
          ? obj.exportedAt
          : new Date().toISOString(),
      workflow: wf as unknown as Workflow,
    };
    return { ok: true, errors: [], data };
  }

  /**
   * Exporte un workflow au format .flowmind.json
   * (téléchargement navigateur)
   */
  async exportWorkflowJSON(
    workflowId?: string
  ): Promise<{ filename: string; bytes: number } | null> {
    const state = StateStore.getState();
    const id = workflowId || state.ui.activeWorkflowId;
    const wf = state.workflows.find((w) => w.id === id) ?? state.workflows[0];
    if (!wf) {
      this.toast('warning', 'Aucun workflow à exporter');
      return null;
    }

    const payload: WorkflowExportSchema = {
      format: 'flowmind-workflow',
      version: 1,
      exportedAt: new Date().toISOString(),
      workflow: structuredClone(wf),
    };
    const json = JSON.stringify(payload, null, 2);
    const safeName = wf.title
      .replace(/[^\w\u00C0-\u024f-]+/gi, '-')
      .replace(/-+/g, '-')
      .slice(0, 40);
    const filename = `${safeName || 'workflow'}.flowmind.json`;

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    EventBus.publish(AppEvents.SYSTEM_EXPORTED, {
      filename,
      bytes: json.length,
      kind: 'workflow',
      workflowId: wf.id,
    });
    this.toast('success', 'Workflow exporté', filename);
    return { filename, bytes: json.length };
  }

  /**
   * Importe un .flowmind.json avec régénération complète des UUIDs
   * pour éviter les collisions d'identifiants.
   */
  async importWorkflowJSON(jsonFile: File | string): Promise<Workflow | null> {
    try {
      const text =
        typeof jsonFile === 'string' ? jsonFile : await jsonFile.text();
      const parsed = JSON.parse(text) as unknown;
      const validation = this.validateWorkflowExport(parsed);
      if (!validation.ok || !validation.data) {
        this.toast('error', 'Import workflow refusé', validation.errors.join(' · '));
        return null;
      }

      const imported = this.regenerateWorkflowIds(validation.data.workflow);
      StateStore.addWorkflow(imported);
      WorkflowEngine.selectWorkflow(imported.id);

      EventBus.publish(AppEvents.WORKFLOW_CREATED, {
        workflow: imported,
        imported: true,
      });
      this.toast('success', 'Workflow importé', imported.title);
      return imported;
    } catch (err) {
      this.toast('error', 'Import échoué', String(err));
      return null;
    }
  }

  /**
   * Régénère tous les IDs (workflow, nodes, edges, subtasks)
   * et réécrit les références source/target des edges.
   */
  regenerateWorkflowIds(source: Workflow): Workflow {
    const now = new Date().toISOString();
    const nodeMap = new Map<string, string>();

    const nodes: WorkflowNode[] = (source.nodes ?? []).map((n) => {
      const newId = uid('node');
      nodeMap.set(n.id, newId);
      const raw = {
        ...n,
        id: newId,
        subtasks: (n.subtasks ?? []).map((s, i) => ({
          ...s,
          id: uid('sub'),
          order: s.order ?? i,
        })),
      };
      return normalizeNode(raw);
    });

    const edges: WorkflowEdge[] = (source.edges ?? [])
      .map((e) => {
        const sourceId = nodeMap.get(e.source);
        const targetId = nodeMap.get(e.target);
        if (!sourceId || !targetId) return null;
        return {
          ...e,
          id: uid('edge'),
          source: sourceId,
          target: targetId,
          sourceHandle: e.sourceHandle ?? 'output',
          targetHandle: e.targetHandle ?? 'input',
        } as WorkflowEdge;
      })
      .filter((e): e is WorkflowEdge => e !== null);

    return {
      ...source,
      id: uid('wf'),
      title: source.title ? `${source.title} (import)` : 'Workflow importé',
      nodes,
      edges,
      createdAt: now,
      updatedAt: now,
      runStatus: 'idle',
      lastRunAt: null,
      viewport: source.viewport ?? { x: 40, y: 40, zoom: 1 },
    };
  }

  private toast(
    type: 'success' | 'info' | 'error' | 'warning',
    title: string,
    description?: string
  ) {
    EventBus.publish(AppEvents.TOAST_SHOW, {
      id: uid('toast'),
      type,
      title,
      description,
      duration: 3000,
    });
  }
}

export const BackupService = new BackupServiceImpl();
export default BackupService;
