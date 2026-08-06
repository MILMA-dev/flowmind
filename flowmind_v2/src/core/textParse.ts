/**
 * Utilitaires d'analyse de Capture Units
 * Extraction #tags, priorités rapides, titre dérivé
 */

import type { CapturePriority, TaskPriority } from './Types';

const TAG_RE = /#([\p{L}\p{N}_/-]+)/gu;
const PRIORITY_RE = /(?:^|\s)(!{1,3})(?=\s|$)/g;

/** Extrait les hashtags du texte brut */
export function extractTags(text: string): string[] {
  const tags = new Set<string>();
  let m: RegExpExecArray | null;
  const re = new RegExp(TAG_RE.source, TAG_RE.flags);
  while ((m = re.exec(text)) !== null) {
    tags.add(m[1].toLowerCase());
  }
  return Array.from(tags);
}

/**
 * Priorité rapide :
 *   !   → low
 *   !!  → medium
 *   !!! → high / critical
 */
export function extractPriority(text: string): CapturePriority {
  let max = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(PRIORITY_RE.source, PRIORITY_RE.flags);
  while ((m = re.exec(text)) !== null) {
    max = Math.max(max, m[1].length);
  }
  if (max >= 3) return 'critical';
  if (max === 2) return 'high';
  if (max === 1) return 'medium';
  return 'none';
}

/** Texte nettoyé sans #tags ni marqueurs ! */
export function stripMeta(text: string): string {
  return text
    .replace(TAG_RE, ' ')
    .replace(PRIORITY_RE, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Première ligne non vide → titre (max 80 chars) */
export function deriveTitle(text: string, max = 80): string {
  const plain = stripMeta(text);
  const line = plain.split('\n').find((l) => l.trim())?.trim() || 'Sans titre';
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1).trim()}…`;
}

/** Map priorité capture → priorité tâche */
export function toTaskPriority(p: CapturePriority): TaskPriority {
  switch (p) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
    case 'none':
    default:
      return 'low';
  }
}

/** Parse complet d'une saisie utilisateur */
export function parseCaptureInput(raw: string): {
  content: string;
  plainText: string;
  tags: string[];
  priority: CapturePriority;
  title: string;
} {
  const content = raw.trim();
  return {
    content,
    plainText: stripMeta(content),
    tags: extractTags(content),
    priority: extractPriority(content),
    title: deriveTitle(content),
  };
}
