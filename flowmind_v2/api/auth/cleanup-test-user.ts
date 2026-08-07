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
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  try {
    const emailNorm = 'millemayake@gmail.com';

    // Recherche de l'utilisateur de test en base
    const user = await prisma.user.findUnique({
      where: { email: emailNorm },
    });

    if (user) {
      // Nettoyage en cascade de toutes les entités associées en base de données
      await prisma.$transaction([
        prisma.note.deleteMany({ where: { userId: user.id } }),
        prisma.todo.deleteMany({ where: { userId: user.id } }),
        prisma.calendarEvent.deleteMany({ where: { userId: user.id } }),
        prisma.workflowNode.deleteMany({ where: { userId: user.id } }),
        prisma.workflowEdge.deleteMany({ where: { userId: user.id } }),
        prisma.workflow.deleteMany({ where: { userId: user.id } }),
        prisma.user.delete({ where: { id: user.id } }),
      ]);

      res.status(200).json({
        success: true,
        message: `L'utilisateur ${emailNorm} et toutes ses données associées ont été supprimés avec succès du serveur PostgreSQL.`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: `L'utilisateur ${emailNorm} n'existe pas ou a déjà été supprimé de la base de données du serveur.`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
