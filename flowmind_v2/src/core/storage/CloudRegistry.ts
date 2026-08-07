/**
 * CloudRegistry — multi-appareils (JSONBlob direct + CAS)
 *
 * L'API /api/cloud Vercel n'est pas toujours déployée (renvoie index.html).
 * On utilise donc JSONBlob en direct avec :
 *  - lecture fraîche avant chaque écriture
 *  - If-Match (ETag) + retries
 *  - mutations granulaires (user OU snapshot) sans écraser l'autre map
 */

import type { EntitySnapshot } from '../Types';

const DEFAULT_BLOB_ID = '019fd80b-b576-7082-8300-c1759024b30a';
const BLOB_BASE = 'https://jsonblob.com/api/jsonBlob';
const BLOB_ID_KEY = 'flowmind:cloud:blob-id';

export interface CloudUserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  avatarUrl?: string | null;
  role?: string | null;
  bio?: string | null;
  preferences?: Record<string, unknown> | null;
  updatedAt: string;
}

export interface CloudDatabase {
  users: Record<string, CloudUserRecord>;
  snapshots: Record<string, EntitySnapshot>;
  version: number;
  updatedAt: string | null;
}

export function getCloudBlobId(): string {
  try {
    const stored = localStorage.getItem(BLOB_ID_KEY);
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  const env =
    typeof import.meta !== 'undefined'
      ? (import.meta.env?.VITE_FLOWMIND_CLOUD_BLOB_ID as string | undefined)
      : undefined;
  return env || DEFAULT_BLOB_ID;
}

export function setCloudBlobId(id: string): void {
  try {
    localStorage.setItem(BLOB_ID_KEY, id.trim());
  } catch {
    /* ignore */
  }
}

export function getCloudRegistryUrl(): string {
  return `${BLOB_BASE}/${getCloudBlobId()}`;
}

function normalizeDb(data: Partial<CloudDatabase> | null | undefined): CloudDatabase {
  return {
    users: data?.users && typeof data.users === 'object' ? { ...data.users } : {},
    snapshots:
      data?.snapshots && typeof data.snapshots === 'object'
        ? { ...data.snapshots }
        : {},
    version: typeof data?.version === 'number' ? data.version : 1,
    updatedAt: data?.updatedAt ?? null,
  };
}

function isHtmlResponse(res: Response, text: string): boolean {
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html')) return true;
  const t = text.trimStart().slice(0, 20).toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html');
}

async function parseJsonResponse(res: Response): Promise<unknown> {
  const text = await res.text();
  if (isHtmlResponse(res, text)) {
    throw new Error(
      'Réponse HTML au lieu de JSON (route API absente). Fallback cloud direct…'
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`JSON invalide (${res.status}): ${text.slice(0, 80)}`);
  }
}

class CloudRegistryImpl {
  private cache: CloudDatabase | null = null;
  private cacheAt = 0;
  private lastEtag: string | null = null;
  private lastError: string | null = null;
  private writeChain: Promise<void> = Promise.resolve();
  private apiAvailable: boolean | null = null;

  readonly CACHE_MS = 600;

  getLastError(): string | null {
    return this.lastError;
  }

  isOnline(): boolean {
    return typeof navigator === 'undefined' ? true : navigator.onLine;
  }

  async ping(): Promise<boolean> {
    try {
      await this.pull(true);
      this.lastError = null;
      return true;
    } catch (e) {
      this.lastError = String((e as Error)?.message || e);
      return false;
    }
  }

  /** GET registre (API same-origin si dispo, sinon JSONBlob) */
  async pull(force = false): Promise<CloudDatabase> {
    if (!force && this.cache && Date.now() - this.cacheAt < this.CACHE_MS) {
      return this.cache;
    }

    // 1) Tente /api/cloud une fois
    if (this.apiAvailable !== false && typeof window !== 'undefined') {
      try {
        const res = await fetch('/api/cloud', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        const json = (await parseJsonResponse(res)) as {
          ok?: boolean;
          db?: CloudDatabase;
          error?: string;
        };
        if (res.ok && json.db) {
          this.apiAvailable = true;
          const db = normalizeDb(json.db);
          this.cache = db;
          this.cacheAt = Date.now();
          this.lastError = null;
          return db;
        }
        this.apiAvailable = false;
      } catch {
        this.apiAvailable = false;
      }
    }

    // 2) JSONBlob direct
    const db = await this.pullBlob();
    this.cache = db;
    this.cacheAt = Date.now();
    this.lastError = null;
    return db;
  }

  private async pullBlob(): Promise<CloudDatabase> {
    const url = getCloudRegistryUrl();
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      mode: 'cors',
      cache: 'no-store',
    });

    this.lastEtag = res.headers.get('etag');

    if (res.status === 404) {
      return this.recreateBlob();
    }
    if (!res.ok) {
      throw new Error(`BLOB_GET_${res.status}`);
    }

    const data = (await parseJsonResponse(res)) as Partial<CloudDatabase>;
    return normalizeDb(data);
  }

  private async recreateBlob(): Promise<CloudDatabase> {
    const init = normalizeDb({
      users: {},
      snapshots: {},
      version: 1,
      updatedAt: new Date().toISOString(),
    });

    // Essaye PUT sur l'id fixe
    const put = await fetch(getCloudRegistryUrl(), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      mode: 'cors',
      body: JSON.stringify(init),
    });

    if (put.ok) {
      this.lastEtag = put.headers.get('etag');
      return init;
    }

    // POST nouveau blob
    const created = await fetch(BLOB_BASE, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      mode: 'cors',
      body: JSON.stringify(init),
    });
    if (!created.ok) throw new Error(`BLOB_CREATE_${created.status}`);

    const loc =
      created.headers.get('Location') ||
      created.headers.get('location') ||
      created.headers.get('X-jsonblob-id') ||
      '';
    const m =
      loc.match(/jsonBlob\/([a-f0-9-]+)/i) ||
      loc.match(/([a-f0-9-]{20,})/i);
    if (m?.[1]) {
      setCloudBlobId(m[1]);
    }
    this.lastEtag = created.headers.get('etag');
    return init;
  }

  /**
   * Mutation atomique : GET frais → mutate → PUT If-Match → retry
   */
  private async atomicMutate(
    mutator: (db: CloudDatabase) => void
  ): Promise<CloudDatabase> {
    const run = async (): Promise<CloudDatabase> => {
      // Prefer granular API if available
      if (this.apiAvailable === true) {
        // handled by callers via postOp for API path
      }

      let lastErr: Error | null = null;
      for (let attempt = 0; attempt < 12; attempt++) {
        try {
          const current = await this.pullBlob();
          const next = normalizeDb(structuredClone(current));
          mutator(next);
          next.updatedAt = new Date().toISOString();
          next.version = (current.version || 1) + 1;

          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          };
          if (this.lastEtag) {
            headers['If-Match'] = this.lastEtag;
          }

          const res = await fetch(getCloudRegistryUrl(), {
            method: 'PUT',
            headers,
            mode: 'cors',
            body: JSON.stringify(next),
          });

          if (res.status === 412 || res.status === 409) {
            // conflit concurrent
            await sleep(40 + attempt * 60);
            continue;
          }

          if (res.status === 404) {
            await this.recreateBlob();
            continue;
          }

          if (!res.ok) {
            // retry without etag once
            if (this.lastEtag && attempt < 2) {
              this.lastEtag = null;
              continue;
            }
            throw new Error(`BLOB_PUT_${res.status}`);
          }

          this.lastEtag = res.headers.get('etag') || this.lastEtag;
          this.cache = next;
          this.cacheAt = Date.now();
          return next;
        } catch (e) {
          lastErr = e as Error;
          await sleep(50 + attempt * 50);
        }
      }
      throw lastErr || new Error('ATOMIC_MUTATE_FAILED');
    };

    const p = this.writeChain.then(run, run);
    this.writeChain = p.then(
      () => undefined,
      () => undefined
    );
    return p;
  }

  private async postApi(op: string, payload: unknown): Promise<CloudDatabase | null> {
    if (this.apiAvailable === false) return null;
    try {
      const res = await fetch('/api/cloud', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ op, payload }),
      });
      const json = (await parseJsonResponse(res)) as {
        ok?: boolean;
        db?: CloudDatabase;
        error?: string;
      };
      if (!res.ok || json.ok === false) {
        this.apiAvailable = false;
        return null;
      }
      this.apiAvailable = true;
      const db = normalizeDb(json.db);
      this.cache = db;
      this.cacheAt = Date.now();
      return db;
    } catch {
      this.apiAvailable = false;
      return null;
    }
  }

  async upsertUser(user: CloudUserRecord): Promise<void> {
    const email = user.email.trim().toLowerCase();
    const payload = {
      ...user,
      email,
      updatedAt: new Date().toISOString(),
    };

    // API granulaire si dispo
    const viaApi = await this.postApi('upsertUser', payload);
    if (viaApi?.users?.[email]) {
      return;
    }

    const db = await this.atomicMutate((next) => {
      next.users[email] = payload;
    });

    if (!db.users[email]) {
      throw new Error('USER_NOT_PERSISTED');
    }
  }

  async findUserByEmail(email: string): Promise<CloudUserRecord | null> {
    const db = await this.pull(true);
    return db.users[email.trim().toLowerCase()] ?? null;
  }

  async findUserById(userId: string): Promise<CloudUserRecord | null> {
    const db = await this.pull(true);
    return Object.values(db.users).find((u) => u.id === userId) ?? null;
  }

  async saveSnapshot(snapshot: EntitySnapshot): Promise<void> {
    const viaApi = await this.postApi('saveSnapshot', snapshot);
    if (viaApi?.snapshots?.[snapshot.userId]) {
      return;
    }

    await this.atomicMutate((next) => {
      const prev = next.snapshots[snapshot.userId];
      if (!prev || (snapshot.revision || 0) >= (prev.revision || 0)) {
        next.snapshots[snapshot.userId] = snapshot;
      }
      // NE PAS toucher next.users
    });
  }

  async getSnapshot(userId: string): Promise<EntitySnapshot | null> {
    const db = await this.pull(true);
    return db.snapshots[userId] ?? null;
  }

  async listUserEmails(): Promise<string[]> {
    const db = await this.pull(true);
    return Object.keys(db.users);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export const CloudRegistry = new CloudRegistryImpl();
export default CloudRegistry;
