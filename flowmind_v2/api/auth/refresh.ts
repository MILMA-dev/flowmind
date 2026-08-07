import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import { prisma } from '../client.js';

interface ApiRequest extends IncomingMessage {
  headers: IncomingMessage['headers'];
}

interface ApiResponse extends ServerResponse {
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not defined');
}

function verifyToken(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [header, payload, signature] = parts;

    // Vérification de la signature HMAC SHA-256
    const hmac = crypto.createHmac('sha256', JWT_SECRET);
    hmac.update(`${header}.${payload}`);
    const expectedSignature = hmac.digest('base64url');

    if (signature !== expectedSignature) return null;

    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

    // Vérification de la date d'expiration
    if (decodedPayload.exp && decodedPayload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decodedPayload;
  } catch {
    return null;
  }
}

function signToken(payload: Record<string, any>, expirySeconds: number): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');

  const payloadWithExpiry = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expirySeconds,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payloadWithExpiry)).toString('base64url');

  const hmac = crypto.createHmac('sha256', JWT_SECRET);
  hmac.update(`${encodedHeader}.${encodedPayload}`);
  const signature = hmac.digest('base64url');

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;

  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    const value = parts.join('=')?.trim();
    if (name && value) {
      list[name] = decodeURIComponent(value);
    }
  });

  return list;
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

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie, Accept');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = cookies.refreshToken;

    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token manquant' });
      return;
    }

    const payload = verifyToken(refreshToken);
    if (!payload || !payload.sub) {
      res.status(401).json({ error: 'Refresh token invalide ou expiré' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      res.status(401).json({ error: 'Utilisateur introuvable' });
      return;
    }

    // Régénération de l'AccessToken
    const nextPayload = {
      sub: user.id,
      email: user.email,
      displayName: user.displayName,
    };

    const accessToken = signToken(nextPayload, 3600); // 1 heure

    res.status(200).json({
      success: true,
      accessToken,
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
