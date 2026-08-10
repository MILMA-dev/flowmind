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

async function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 10000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      resolve(derivedKey.toString('hex'));
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
    const { id, email, password, displayName } = body;

    if (!email || !password) {
      res.status(400).json({ error: 'E-mail et mot de passe requis' });
      return;
    }

    const emailNorm = String(email).trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: emailNorm },
    });

    if (existingUser) {
      res.status(400).json({ error: 'Un compte existe déjà avec cet e-mail' });
      return;
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hashedPassword = await hashPassword(password, salt);
    const dbPasswordHash = `${salt}:${hashedPassword}`;

    // Génération d'un jeton de session opaque aléatoire (OWASP - Pas de JWT)
    const opaqueSessionToken = crypto.randomBytes(32).toString('hex');

    const newUser = await prisma.user.create({
      data: {
        id: id || crypto.randomUUID(),
        email: emailNorm,
        displayName: displayName || emailNorm.split('@')[0],
        passwordHash: dbPasswordHash,
        sessionToken: opaqueSessionToken,
        emailVerified: true,
      },
    });

    // Validité illimitée de 10 ans
    const tenYearsSeconds = 10 * 365 * 24 * 3600;

    // Cookie de validité de 10 ans avec le jeton opaque
    res.setHeader(
      'Set-Cookie',
      `refreshToken=${opaqueSessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/; Max-Age=${tenYearsSeconds}`
    );

    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès',
      accessToken: opaqueSessionToken,
      user: {
        id: newUser.id,
        email: newUser.email,
        displayName: newUser.displayName,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
