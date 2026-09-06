import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LinkBody from '../src/components/LinkBody';
import type { Card } from '../src/lib/notes';
import { normalizeLinkUrl } from '../src/lib/notesLinkUrl';

afterEach(cleanup);
const card = (url = '') => ({ id: 'link-card', type: 'link', payload: { title: 'A website', url } } as Card);
function EditableLink({ url = '', onPatch = vi.fn() }) {
  const [value, setValue] = useState(card(url));
  return <LinkBody card={value} onPatch={patch => { onPatch(patch); setValue(previous => ({ ...previous, ...patch })); }} />;
}

describe('finished link cards', () => {
  it('turns a pasted URL into a real link when Done is clicked', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<EditableLink onPatch={onPatch} />);
    await user.click(screen.getByRole('textbox', { name: 'Link URL' }));
    await user.paste('https://example.com/article');
    await user.click(screen.getByRole('button', { name: 'Done' }));
    const link = screen.getByRole('link', { name: 'https://example.com/article' });
    expect(link).toHaveAttribute('href', 'https://example.com/article');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('textbox', { name: 'Link URL' })).not.toBeInTheDocument();
    expect(onPatch).toHaveBeenCalledWith({ payload: { title: 'A website', url: 'https://example.com/article' } });
  });
  it('accepts Enter and adds https to a pasted bare address', async () => {
    const user = userEvent.setup();
    render(<EditableLink />);
    await user.type(screen.getByRole('textbox', { name: 'Link URL' }), 'example.com/path{Enter}');
    expect(screen.getByRole('link', { name: 'https://example.com/path' })).toHaveAttribute('href', 'https://example.com/path');
    expect(screen.getByRole('link', { name: 'visit ↗' })).toHaveAttribute('href', 'https://example.com/path');
  });
  it('finishes on blur and allows the URL to be edited again', async () => {
    const user = userEvent.setup();
    render(<EditableLink url="https://example.com/old" />);
    await user.click(screen.getByRole('button', { name: 'Edit link' }));
    const input = screen.getByRole('textbox', { name: 'Link URL' });
    await user.clear(input); await user.type(input, 'www.example.org/new');
    await user.tab();
    expect(screen.getByRole('link', { name: 'https://www.example.org/new' })).toHaveAttribute('href', 'https://www.example.org/new');
  });
  it.each(['nt-card', 'col-member'])('keeps saved links clickable inside %s without starting a drag or embed', wrapper => {
    const drag = vi.fn(), doubleClick = vi.fn();
    render(<div className={`${wrapper} type-link`} onMouseDown={drag} onDoubleClick={doubleClick}><EditableLink url="example.com" /></div>);
    const link = screen.getByRole('link', { name: 'https://example.com/' });
    fireEvent.mouseDown(link); fireEvent.doubleClick(link);
    expect(drag).not.toHaveBeenCalled(); expect(doubleClick).not.toHaveBeenCalled();
    expect(link).toHaveAttribute('href', 'https://example.com/');
  });
  it('allows an existing URL to be cleared', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<EditableLink url="https://example.com" onPatch={onPatch} />);
    await user.click(screen.getByRole('button', { name: 'Edit link' }));
    await user.clear(screen.getByRole('textbox', { name: 'Link URL' }));
    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(onPatch).toHaveBeenCalledWith({ payload: { title: 'A website', url: '' } });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
  it('keeps invalid URLs editable instead of creating unsafe or relative links', async () => {
    const user = userEvent.setup();
    const onPatch = vi.fn();
    render(<EditableLink onPatch={onPatch} />);
    await user.type(screen.getByRole('textbox', { name: 'Link URL' }), 'javascript:alert(1){Enter}');
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a web address');
    expect(onPatch).not.toHaveBeenCalled();
  });
});

describe('pasted web address normalization', () => {
  it('trims surrounding spaces and preserves paths, queries, fragments and HTTP', () => {
    expect(normalizeLinkUrl('  https://example.com/a?q=one#two  ')).toBe('https://example.com/a?q=one#two');
    expect(normalizeLinkUrl('http://example.com')).toBe('http://example.com/');
    expect(normalizeLinkUrl('//example.com/path')).toBe('https://example.com/path');
  });
  it('rejects non-web schemes, control characters, and incomplete addresses', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,x', 'file:///tmp/x', 'not a url', 'example', '', 'https://', 'java\nscript:alert(1)']) {
      expect(normalizeLinkUrl(value)).toBeNull();
    }
  });
});
