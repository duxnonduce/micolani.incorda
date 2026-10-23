'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { useApp } from '@/components/AppProvider';
import { Caricamento, Vuoto } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { cordeTesto, dataBreve, erroreMsg } from '@/lib/format';

function ordina(a, b) {
  if (a.priorita !== b.priorita) return a.priorita === 'urgente' ? -1 : 1;
  return new Date(a.consegnata_at) - new Date(b.consegnata_at);
}

function nomeRacchetta(l) {
  return [l.racchetta_marca, l.racchetta_modello, l.racchetta_identificazione].filter(Boolean).join(' ') || 'Racchetta';
}

export default function Coda() {
  const { session, profilo, tick, toast, refresh } = useApp();
  const [lavori, setLavori] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!session || !profilo) return;
    supabase().from('v_lavori').select('*').in('stato_lavoro', ['attesa', 'lavorazione']).limit(500)
      .then(({ data, error }) => {
        if (error) return toast(erroreMsg(error), 'errore');
        setLavori((data || []).sort(ordina));
      });
  }, [session, profilo, tick, toast]);

  async function pronta(l) {
    setBusy(l.id);
    const { error } = await supabase().rpc('cambia_stato_lavoro', { p_lavoro_id: l.id, p_stato: 'pronta' });
    setBusy(null);
    if (error) return toast(erroreMsg(error), 'errore');
    toast(`${l.cliente_nome} ${l.cliente_cognome}: pronta`, 'pronta');
    refresh();
  }

  return (
    <Shell title={`In attesa${lavori ? ` (${lavori.length})` : ''}`} ruolo={['incordatore', 'segreteria']}>
      <Link href="/nuovo" className="btn btn-primary btn-big">+ Nuova incordatura</Link>

      {!lavori ? <Caricamento /> : !lavori.length ? <Vuoto>Nessuna racchetta in attesa.</Vuoto> : lavori.map((l) => (
        <article key={l.id} className={'lavoro-card' + (l.priorita === 'urgente' ? ' urgente' : '')}>
          <Link href={`/lavori/${l.id}`} className="stack-0" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 400 }}>
            <strong style={{ fontSize: 18 }}>{l.cliente_nome} {l.cliente_cognome}</strong>
            <span>{nomeRacchetta(l)}</span>
            <span className="strong" style={{ fontSize: 17, marginTop: 4 }}>{cordeTesto(l) || <span className="muted">Corde e tensione non indicate</span>}</span>
            <span className="small muted" style={{ marginTop: 2 }}>Lasciata il {dataBreve(l.consegnata_at)}</span>
          </Link>
          <button className="btn btn-primary btn-big" disabled={busy === l.id} onClick={() => pronta(l)}>
            {busy === l.id ? 'Salvataggio…' : 'Pronta'}
          </button>
        </article>
      ))}
    </Shell>
  );
}
