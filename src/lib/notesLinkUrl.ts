/** Turn pasted web addresses into absolute links; never navigate to script URLs. */
export function normalizeLinkUrl(value: string): string | null {
  const text = value.trim();
  if (!text || /[\u0000-\u0020\u007f]/.test(text)) return null;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(text);
  try {
    const url = new URL(hasScheme ? text : text.startsWith('//') ? `https:${text}` : `https://${text}`);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
    if (!hasScheme && !url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.href;
  } catch { return null; }
}
