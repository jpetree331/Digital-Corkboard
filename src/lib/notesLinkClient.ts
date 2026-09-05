import type { LinkMeta } from './notesLinkMeta';

// Local mode has no authenticated metadata server. Preserve the original
// plain-link fallback without calling Wardrobe's cloud services.
export async function fetchLinkMeta(_url: string): Promise<LinkMeta | null> {
  return null;
}
