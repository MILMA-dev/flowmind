import type { IncomingMessage, ServerResponse } from 'http';

interface ApiResponse extends ServerResponse {
  status: (statusCode: number) => ApiResponse;
  json: (body: unknown) => void;
}

export default async function handler(req: IncomingMessage, res: ApiResponse): Promise<void> {
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
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie, Accept');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  // Suppression immédiate du cookie en réglant sa date d'expiration dans le passé (Max-Age=0)
  res.setHeader(
    'Set-Cookie',
    'refreshToken=; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  );

  res.status(200).json({
    success: true,
    message: 'Session révoquée avec succès',
  });
}
