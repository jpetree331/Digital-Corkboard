import { useEffect, useState, type FormEvent } from 'react';
import Notes from './pages/Notes';
import { clearMediaCache, request } from './lib/dataClient';
import './Auth.css';
export default function App() {
  const [state, setState] = useState<'checking' | 'locked' | 'open'>('checking');
  const [opened, setOpened] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    request('session').then(result => {
      if (active) { setState(result.authenticated ? 'open' : 'locked'); setOpened(result.authenticated); }
    }).catch(err => { if (active) { setError(err.message); setState('locked'); } });
    const locked = () => { setState('locked'); setError('Your session expired. Unlock to continue saving your changes.'); };
    window.addEventListener('corkboard-locked', locked);
    return () => { active = false; window.removeEventListener('corkboard-locked', locked); };
  }, []);
  async function unlock(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await request('login', { password });
      setPassword(''); setState('open'); setOpened(true);
      window.dispatchEvent(new Event('corkboard-unlocked'));
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function lock() {
    await request('logout', {});
    setOpened(false); setState('locked'); await clearMediaCache();
  }
  return <>
    {opened && <Notes onLock={lock} />}
    {state !== 'open' && <main className="workspace-lock">
      <form onSubmit={unlock} className="workspace-login">
        <p className="workspace-eyebrow">DIGITAL CORKBOARD</p>
        <h1>Your space for ideas.</h1>
        <p>Unlock your private notes workspace.</p>
        {state === 'checking' ? <p>Opening your workspace…</p> : <>
          <label htmlFor="workspace-password">Workspace password</label>
          <input id="workspace-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
          <button disabled={busy} type="submit">{busy ? 'Unlocking…' : 'Unlock workspace'}</button>
        </>}
        {error && <p role="alert">{error}</p>}
      </form>
    </main>}
  </>;
}
