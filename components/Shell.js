'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useApp } from './AppProvider';
import { supabase } from '@/lib/supabase';

const I = {
  home: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  coda: <><circle cx="12" cy="12" r="9" /><path d="M12 3v18M3 12h18" /></>,
  lavori: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  clienti: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  nuovo: <><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></>,
};

function Icona({ d }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  );
}

export default function Shell({ title, back, actions, children, ruolo }) {
  const { session, profilo, has, abilitato, online } = useApp();
  const router = useRouter();
  const path = usePathname();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (session === null) router.replace('/login');
  }, [session, router]);

  if (session === undefined || (session && !profilo)) {
    return <div className="centro"><div className="spinner" aria-label="Caricamento" /></div>;
  }
  if (!session) return null;

  if (!abilitato) {
    return (
      <div className="centro">
        <div className="card" style={{ maxWidth: 380 }}>
          <h1 className="h2">Account non ancora abilitato</h1>
          <p className="muted">Chiedi all’amministratore di assegnarti un ruolo, poi rientra.</p>
          <button className="btn btn-outline" onClick={() => supabase().auth.signOut()}>Esci</button>
        </div>
      </div>
    );
  }

  const voci = [
    has('segreteria') && { href: '/', label: 'Riepilogo', d: I.home },
    has('incordatore') && { href: '/coda', label: 'Coda', d: I.coda },
    { href: '/lavori', label: 'Lavori', d: I.lavori },
    has('segreteria') && { href: '/clienti', label: 'Clienti', d: I.clienti },
    (has('segreteria') || has('incordatore')) && { href: '/nuovo', label: 'Nuovo', d: I.nuovo },
  ].filter(Boolean);

  const attivo = (href) => (href === '/' ? path === '/' : path.startsWith(href));
  const iniziali = ((profilo?.nome || '')[0] || '') + ((profilo?.cognome || '')[0] || '') || (profilo?.email || '?')[0];
  const permesso = !ruolo || [].concat(ruolo).some((r) => has(r));

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-in">
          {back ? (
            <button className="icon-btn" aria-label="Indietro" onClick={() => (window.history.length > 1 ? router.back() : router.push(back))}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
          ) : null}
          <div className="topbar-title">
            <span className="brand">Micolani Incorda</span>
            <h1>{title}</h1>
          </div>
          {actions}
          <div style={{ position: 'relative' }}>
            <button className="avatar" aria-label="Menu operatore" onClick={() => setMenu((m) => !m)}>
              {iniziali.toUpperCase()}
            </button>
            {menu && (
              <div className="menu" onMouseLeave={() => setMenu(false)}>
                <div className="menu-head">
                  <strong>{[profilo.nome, profilo.cognome].filter(Boolean).join(' ') || profilo.email}</strong>
                  <span className="muted small">{profilo.ruoli.join(', ')}</span>
                </div>
                {has('admin') && <Link href="/impostazioni" className="menu-item" onClick={() => setMenu(false)}>Impostazioni e operatori</Link>}
                <button className="menu-item" onClick={() => supabase().auth.signOut()}>Esci</button>
              </div>
            )}
          </div>
        </div>
        {!online && <div className="offline">Sei offline: le operazioni non verranno salvate finché la connessione non torna.</div>}
      </header>

      <main className="contenuto">
        {permesso ? children : <div className="card"><p>Non hai i permessi per questa pagina.</p></div>}
      </main>

      <nav className="bottomnav" style={{ gridTemplateColumns: `repeat(${voci.length}, minmax(0, 1fr))` }}>
        {voci.map((v) => (
          <Link key={v.href} href={v.href} className={'nav-item' + (attivo(v.href) ? ' attivo' : '')}>
            <Icona d={v.d} />
            {v.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
