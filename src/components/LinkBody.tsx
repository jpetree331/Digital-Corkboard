import { useEffect, useRef, useState } from 'react';
import type { Card, LinkPayload } from '../lib/notes';
import { domainOf, embedUrlFor } from '../lib/notesLinkMeta';
import { normalizeLinkUrl } from '../lib/notesLinkUrl';

export default function LinkBody({ card, onPatch }: {
  card: Card;
  onPatch: (patch: Partial<Card>) => void;
}) {
  const payload = card.payload as LinkPayload;
  const href = normalizeLinkUrl(payload.url || '');
  const [editing, setEditing] = useState(!href);
  const [draft, setDraft] = useState(payload.url || '');
  const [error, setError] = useState('');
  const titleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (titleRef.current && document.activeElement !== titleRef.current) titleRef.current.textContent = payload.title || '';
  }, [payload.title]);
  useEffect(() => {
    if (!editing) setDraft(payload.url || '');
  }, [payload.url, editing]);
  function finish() {
    if (!draft.trim()) {
      if (payload.url) onPatch({ payload: { ...payload, url: '' } });
      setDraft(''); setError(''); setEditing(true);
      return;
    }
    const url = normalizeLinkUrl(draft);
    if (!url) {
      setError(draft.trim() ? 'Enter a web address, such as https://example.com.' : '');
      return;
    }
    onPatch({ payload: { ...payload, url } });
    setDraft(url); setError(''); setEditing(false);
  }
  const domain = href ? domainOf(href) : '';
  const embeddable = href ? embedUrlFor(href) !== null : false;
  const linkProps = {
    href: href || undefined, target: '_blank', rel: 'noopener noreferrer', draggable: false,
    onMouseDown: (event: React.MouseEvent) => event.stopPropagation(),
    onDoubleClick: (event: React.MouseEvent) => event.stopPropagation(),
  };
  return <>
    {payload.image && <div className="link-thumb"><img src={payload.image} alt="" draggable={false} loading="lazy" /></div>}
    <div className="link-head">
      {payload.favicon && <img className="link-favicon" src={payload.favicon} alt="" draggable={false}
        onError={e => { e.currentTarget.style.display = 'none'; }} />}
      <div ref={titleRef} className="title" contentEditable suppressContentEditableWarning data-placeholder="Link title"
        onInput={e => onPatch({ payload: { ...payload, title: e.currentTarget.textContent || '' } })} />
    </div>
    {(domain || payload.siteName) && <div className="link-domain">{payload.siteName || domain}{embeddable ? ' · double-click to play' : ''}</div>}
    {editing || !href ? <>
      <input className="url-input" type="url" aria-label="Link URL" placeholder="https://…" value={draft}
        onChange={e => { setDraft(e.target.value); setError(''); }} onBlur={finish}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); finish(); }
          if (e.key === 'Escape' && href) { setDraft(payload.url); setError(''); setEditing(false); }
        }} />
      <button className="open" onMouseDown={e => e.preventDefault()} onClick={finish}>Done</button>
      {error && <div className="link-error" role="alert">{error}</div>}
    </> : <>
      <a {...linkProps} className="url-link" title="Open in new tab">{href}</a>
      <div className="link-actions">
        <a {...linkProps} className="open" title="Open in new tab">visit ↗</a>
        <button className="open" onClick={() => { setDraft(payload.url); setEditing(true); }}>Edit link</button>
      </div>
    </>}
  </>;
}
