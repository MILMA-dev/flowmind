import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { prisma } from '../client.js';
import rateLimiter from '../middleware/rateLimiter.js';

interface ApiRequest extends IncomingMessage {
  body?: any;
}

interface ApiResponse extends ServerResponse {
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
}

async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [salt, hash] = storedHash.split(':');
  if (!salt || !hash) return false;
  return new Promise((resolve) => {
    crypto.pbkdf2(password, salt, 10000, 64, 'sha512', (err, derivedKey) => {
      if (err) resolve(false);
      resolve(derivedKey.toString('hex') === hash);
    });
  });
}

async function getRequestBody(req: ApiRequest): Promise<any> {
  if (req.body) return req.body;
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
  });
}

function runMiddleware(req: any, res: any, fn: any) {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
    if (res.writableEnded || res.finished) {
      resolve(null);
    }
  });
}

export default async function handler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (typeof res.status !== 'function') {
    res.status = function (statusCode: number): ApiResponse {
      this.statusCode = statusCode;
      return this;
    };
  }
  if (typeof res.json !== 'function') {
    res.json = function (body: unknown): void {
      this.setHeader('Content-Type', 'application/json');
      this.end(JSON.stringify(body));
    };
  }

  // Apply Rate Limiter middleware
  await runMiddleware(req, res, rateLimiter);
  if (res.writableEnded) return;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = await getRequestBody(req);
    const { email, password } = body;

    if (!email || !password) {
      res.status(400).json({ error: 'E-mail et mot de passe requis' });
      return;
    }

    const emailNorm = String(email).trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: emailNorm },
    });

    if (!user || !user.passwordHash) {
      res.status(401).json({ error: 'Identifiants incorrects' });
      return;
    }

    // Verify password PBKDF2 hash match
    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Identifiants incorrects' });
      return;
    }

    // Génération d'un jeton de session opaque aléatoire (OWASP - Pas de JWT)
    const opaqueSessionToken = crypto.randomBytes(32).toString('hex');

    // Mise à jour de la session de l'utilisateur en base
    await prisma.user.update({
      where: { id: user.id },
      data: { sessionToken: opaqueSessionToken },
    });

    // Validité illimitée de 10 ans
    const tenYearsSeconds = 10 * 365 * 24 * 3600;

    // Set 10-year HttpOnly secure cookie
    res.setHeader(
      'Set-Cookie',
      `refreshToken=${opaqueSessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/; Max-Age=${tenYearsSeconds}`
    );

    res.status(200).json({
      success: true,
      accessToken: opaqueSessionToken,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
