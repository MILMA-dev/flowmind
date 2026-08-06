import React from 'react';
import { Sanitizer } from '../../../core/security/Sanitizer';

interface SafeHTMLViewerProps {
  content: string;
  className?: string;
}

export const SafeHTMLViewer = ({ content, className = '' }: SafeHTMLViewerProps) => {
  const cleanHTML = Sanitizer.sanitize(content);
  return (
    <div
      className={`prose prose-invert max-w-none text-zinc-300 text-sm leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: cleanHTML }}
    />
  );
};

export default SafeHTMLViewer;
