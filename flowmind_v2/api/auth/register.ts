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

function signToken(payload: Record<string, any>, expirySeconds: number, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');

  const payloadWithExpiry = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expirySeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payloadWithExpiry)).toString('base64url');

  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${encodedHeader}.${encodedPayload}`);
  const signature = hmac.digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
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

  // Handle missing environment variable dynamically
  const JWT_SECRET = process.env.JWT_SECRET;
  if (!JWT_SECRET) {
    res.status(500).json({
      success: false,
      error: 'Configuration Error: JWT_SECRET environment variable is missing on the server.',
    });
    return;
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

    // On utilise l'ID généré par le client s'il est fourni pour assurer une cohérence d'ID absolue (anti-deadlock)
    const newUser = await prisma.user.create({
      data: {
        id: id || crypto.randomUUID(),
        email: emailNorm,
        displayName: displayName || emailNorm.split('@')[0],
        passwordHash: dbPasswordHash,
        emailVerified: true,
      },
    });

    // Durée de validité illimitée (10 ans) pour éliminer les expirations intempestives
    const tenYearsSeconds = 10 * 365 * 24 * 3600;
    const payload = {
      sub: newUser.id,
      email: newUser.email,
      displayName: newUser.displayName,
    };

    const accessToken = signToken(payload, tenYearsSeconds, JWT_SECRET);
    const refreshToken = signToken(payload, tenYearsSeconds, JWT_SECRET);

    // Cookie de validité de 10 ans
    res.setHeader(
      'Set-Cookie',
      `refreshToken=${refreshToken}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/; Max-Age=${tenYearsSeconds}`
    );

    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès',
      accessToken,
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
