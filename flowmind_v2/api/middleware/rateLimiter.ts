import type { IncomingMessage, ServerResponse } from 'http';

interface RateLimitRecord {
  timestamps: number[];
}

const rateLimitCache = new Map<string, RateLimitRecord>();

/**
 * Nettoyage périodique pour éviter d'encombrer la mémoire vive.
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitCache.entries()) {
    // Ne conserve que les requêtes effectuées dans la dernière minute
    const validTimestamps = record.timestamps.filter((t) => now - t < 60000);
    if (validTimestamps.length === 0) {
      rateLimitCache.delete(key);
    } else {
      record.timestamps = validTimestamps;
    }
  }
}, 30000);

/**
 * Middleware de limitation de débit (Rate Limiter) par adresse IP.
 * Seuil de 10 requêtes par minute sur l'authentification (/api/auth/*)
 * Seuil de 60 requêtes par minute sur la synchronisation (/api/sync/*)
 */
export function rateLimiter(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
): void {
  const ip =
    (req.headers['x-forwarded-for'] as string) ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  const path = req.url || '';
  const isAuth = path.includes('/api/auth');
  const limit = isAuth ? 10 : 60; // Quota strict de 10/min pour auth, 60/min pour sync

  const cacheKey = `${ip}:${isAuth ? 'auth' : 'sync'}`;
  const now = Date.now();

  let record = rateLimitCache.get(cacheKey);
  if (!record) {
    record = { timestamps: [] };
    rateLimitCache.set(cacheKey, record);
  }

  // Filtrage des horodatages obsolètes
  record.timestamps = record.timestamps.filter((t) => now - t < 60000);

  if (record.timestamps.length >= limit) {
    const oldestTimestamp = record.timestamps[0];
    const retryAfterSeconds = Math.ceil((60000 - (now - oldestTimestamp)) / 1000);

    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.end(
      JSON.stringify({
        success: false,
        error: 'Too many requests. Please slow down.',
        retryAfter: retryAfterSeconds,
      })
    );
    return;
  }

  record.timestamps.push(now);
  next();
}

export default rateLimiter;
