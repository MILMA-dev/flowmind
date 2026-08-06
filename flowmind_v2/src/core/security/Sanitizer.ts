import DOMPurify from 'dompurify';

export class Sanitizer {
  /**
   * Assainit le contenu HTML ou Markdown utilisateur pour se prémunir des failles XSS.
   * Filtre les scripts, les gestionnaires d'événements (onload, error, etc.) et les URLs non sécurisées.
   */
  static sanitize(dirtyHtml: string): string {
    if (!dirtyHtml) return '';
    return DOMPurify.sanitize(dirtyHtml, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'span', 'div', 'code', 'pre', 'a', 'img', 'blockquote', 'hr'
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'style', 'target'],
    }) as string;
  }
}

export default Sanitizer;
