import type { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../client.js';

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Secret, Accept');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const adminSecret = process.env.ADMIN_CLEANUP_SECRET;
    const reqSecret = req.headers['x-admin-secret'];

    // Protection stricte: Si le secret n'est pas configuré sur le serveur, ou s'il ne correspond pas au secret envoyé dans les en-têtes, on rejette immédiatement la requête.
    if (!adminSecret || reqSecret !== adminSecret) {
      res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or missing X-Admin-Secret header.',
      });
      return;
    }

    // Purge de l'ensemble de la base de données PostgreSQL pour réinitialiser le code de production à zéro
    await prisma.$transaction([
      prisma.note.deleteMany({}),
      prisma.todo.deleteMany({}),
      prisma.calendarEvent.deleteMany({}),
      prisma.workflowNode.deleteMany({}),
      prisma.workflowEdge.deleteMany({}),
      prisma.workflow.deleteMany({}),
      prisma.user.deleteMany({}),
    ]);

    res.status(200).json({
      success: true,
      message: 'Base de données de production entièrement réinitialisée à zéro. Tous les utilisateurs et entités ont été supprimés avec succès.',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
