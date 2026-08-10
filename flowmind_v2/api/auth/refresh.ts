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

    // Récupération de l'utilisateur associé au jeton de session opaque en base de données
    const user = await prisma.user.findUnique({
      where: { sessionToken: refreshToken },
    });

    if (!user) {
      res.status(401).json({ error: 'Session invalide ou expirée' });
      return;
    }

    // Régénération d'un nouveau jeton de session opaque pour la rotation de session (OWASP Hardening)
    const nextOpaqueSessionToken = crypto.randomBytes(32).toString('hex');

    await prisma.user.update({
      where: { id: user.id },
      data: { sessionToken: nextOpaqueSessionToken },
    });

    // Validité illimitée de 10 ans
    const tenYearsSeconds = 10 * 365 * 24 * 3600;

    // Cookie de validité de 10 ans avec le jeton opaque
    res.setHeader(
      'Set-Cookie',
      `refreshToken=${nextOpaqueSessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/; Max-Age=${tenYearsSeconds}`
    );

    res.status(200).json({
      success: true,
      accessToken: nextOpaqueSessionToken,
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
