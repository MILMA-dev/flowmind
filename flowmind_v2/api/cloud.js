/**
 * Vercel Serverless — registre cloud multi-appareils (same-origin)
 * Mises à jour atomiques avec ETag (If-Match) pour éviter d'effacer
 * les users lors d'un push concurrent de snapshots.
 *
 * Converti en ES Modules (ESM) pour la compatibilité de build Vercel.
 */

const DEFAULT_BLOB_ID = '019fd80b-b576-7082-8300-c1759024b30a';
const BLOB_BASE = 'https://jsonblob.com/api/jsonBlob';

const EMPTY = {
  users: {},
  snapshots: {},
  version: 1,
  updatedAt: null,
};

function blobId() {
  return process.env.FLOWMIND_CLOUD_BLOB_ID || DEFAULT_BLOB_ID;
}

function blobUrl() {
  return `${BLOB_BASE}/${blobId()}`;
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,PATCH,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  res.setHeader('Cache-Control', 'no-store');
}

function normalize(data) {
  return {
    users:
      data && typeof data.users === 'object' && data.users ? data.users : {},
    snapshots:
      data && typeof data.snapshots === 'object' && data.snapshots
        ? data.snapshots
        : {},
    version: typeof data?.version === 'number' ? data.version : 1,
    updatedAt: data?.updatedAt ?? null,
  };
}

async function readRemoteWithEtag() {
  const res = await fetch(blobUrl(), {
    headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
    cache: 'no-store',
  });

  if (res.status === 404) {
    // Initialise le blob partagé
    const init = {
      ...EMPTY,
      updatedAt: new Date().toISOString(),
    };
    const put = await fetch(blobUrl(), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(init),
    });
    if (!put.ok) {
      // fallback POST new (id peut changer — on réessaie PUT fixed id)
      await fetch(BLOB_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(init),
      });
      const retry = await fetch(blobUrl(), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(init),
      });
      if (!retry.ok) throw new Error(`INIT_${retry.status}`);
      return { db: init, etag: retry.headers.get('etag') };
    }
    return { db: init, etag: put.headers.get('etag') };
  }

  if (!res.ok) throw new Error(`GET_${res.status}`);
  const data = await res.json();
  return {
    db: normalize(data),
    etag: res.headers.get('etag'),
  };
}

async function writeRemoteCas(db, etag) {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (etag) headers['If-Match'] = etag;

  const res = await fetch(blobUrl(), {
    method: 'PUT',
    headers,
    body: JSON.stringify(db),
  });

  // 412 Precondition Failed = concurrent write
  if (res.status === 412 || res.status === 409) {
    return { ok: false, conflict: true };
  }
  if (!res.ok) {
    // Certains proxies ignorent If-Match — tenter sans si 400
    if (etag && (res.status === 400 || res.status === 428)) {
      const retry = await fetch(blobUrl(), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(db),
      });
      if (!retry.ok) throw new Error(`PUT_${retry.status}`);
      return { ok: true, etag: retry.headers.get('etag') };
    }
    throw new Error(`PUT_${res.status}`);
  }
  return { ok: true, etag: res.headers.get('etag') };
}

/**
 * Mutation atomique avec retries CAS
 */
async function atomicMutate(mutator) {
  let lastErr;
  for (let attempt = 0; attempt < 10; attempt++) {
    const { db, etag } = await readRemoteWithEtag();
    const draft = JSON.parse(JSON.stringify(db));
    mutator(draft);
    draft.updatedAt = new Date().toISOString();
    draft.version = (db.version || 1) + 1;
    // Garantit la structure
    draft.users = draft.users || {};
    draft.snapshots = draft.snapshots || {};

    try {
      const result = await writeRemoteCas(draft, etag);
      if (result.conflict) {
        // backoff
        await new Promise((r) => setTimeout(r, 50 + attempt * 40));
        continue;
      }
      // Re-read to confirm (and return canonical)
      const verify = await readRemoteWithEtag();
      return verify.db;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 50 + attempt * 40));
    }
  }
  throw lastErr || new Error('CAS_EXHAUSTED');
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === 'GET') {
      const { db } = await readRemoteWithEtag();
      res.status(200).json({
        ok: true,
        db,
        blobId: blobId(),
        via: 'vercel-api',
        userCount: Object.keys(db.users || {}).length,
        snapshotCount: Object.keys(db.snapshots || {}).length,
      });
      return;
    }

    const body =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : req.body || {};

    // POST — opérations granulaires (recommandé)
    if (req.method === 'POST' || req.method === 'PATCH') {
      const op = body.op;
      const payload = body.payload;

      const db = await atomicMutate((next) => {
        if (op === 'upsertUser' && payload?.email) {
          const email = String(payload.email).trim().toLowerCase();
          next.users[email] = {
            ...payload,
            email,
            updatedAt: new Date().toISOString(),
          };
          return;
        }
        if (op === 'saveSnapshot' && payload?.userId) {
          const prev = next.snapshots[payload.userId];
          if (!prev || (payload.revision || 0) >= (prev.revision || 0)) {
            next.snapshots[payload.userId] = payload;
          }
          return;
        }
        if (op === 'deleteUser' && payload?.email) {
          delete next.users[String(payload.email).trim().toLowerCase()];
          return;
        }
        throw new Error('INVALID_OP');
      });

      res.status(200).json({
        ok: true,
        db,
        via: 'vercel-api',
        userCount: Object.keys(db.users || {}).length,
      });
      return;
    }

    // PUT — merge défensif (ne jamais remplacer users par un objet vide)
    if (req.method === 'PUT') {
      const incoming = body;
      const db = await atomicMutate((next) => {
        const inUsers = incoming.users || {};
        for (const [email, u] of Object.entries(inUsers)) {
          if (!u || typeof u !== 'object') continue;
          const prev = next.users[email];
          if (!prev) {
            next.users[email] = u;
            continue;
          }
          const pt = prev.updatedAt ? new Date(prev.updatedAt).getTime() : 0;
          const ut = u.updatedAt ? new Date(u.updatedAt).getTime() : 0;
          if (ut >= pt) next.users[email] = u;
        }
        const inSnaps = incoming.snapshots || {};
        for (const [uid, snap] of Object.entries(inSnaps)) {
          if (!snap) continue;
          const prev = next.snapshots[uid];
          if (!prev || (snap.revision || 0) >= (prev.revision || 0)) {
            next.snapshots[uid] = snap;
          }
        }
      });

      res.status(200).json({
        ok: true,
        db,
        via: 'vercel-api',
        userCount: Object.keys(db.users || {}).length,
      });
      return;
    }

    res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  } catch (err) {
    console.error('[api/cloud]', err);
    res.status(500).json({
      ok: false,
      error: String(err?.message || err),
    });
  }
}
