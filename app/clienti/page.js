'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { useApp } from '@/components/AppProvider';
import { Caricamento, Vuoto } from '@/components/ui';
import NuovoClienteModal from '@/components/NuovoClienteModal';
import { supabase } from '@/lib/supabase';
import { centCSV, corrisponde, data, erroreMsg, euro, giorniDa, paroleRicerca, scaricaCSV } from '@/lib/format';

function Clienti() {
  const sp = useSearchParams();
  const router = useRouter();
  const { session, profilo, tick, toast } = useApp();
  const [q, setQ] = useState(sp.get('q') || '');
  const [debiti, setDebiti] = useState(sp.get('debiti') === '1');
  const [righe, setRighe] = useState(null);
  const [nuovo, setNuovo] = useState(false);

  const parole = paroleRicerca(q);
  const prima = parole[0] || '';

  useEffect(() => {
    if (!session || !profilo) return;
    let query = supabase().from('v_saldi_clienti').select('*');
    if (debiti) query = query.gt('residuo_totale_cent', 0).order('residuo_ritirate_cent', { ascending: false }).order('residuo_totale_cent', { ascending: false });
    else query = query.order('cognome').order('nome');
    if (prima) query = query.or(`nome.ilike.*${prima}*,cognome.ilike.*${prima}*,codice.ilike.*${prima}*,telefono.ilike.*${prima}*`);
    query = query.limit(300);
    const t = setTimeout(() => {
      query.then(({ data: d, error }) => {
        if (error) return toast(erroreMsg(error), 'errore');
        setRighe(d || []);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [session, profilo, tick, debiti, prima, toast]);

  const lista = (righe || []).filter((c) => corrisponde(parole, [c.nome, c.cognome, c.codice, c.telefono]));
  const totale = lista.reduce((a, c) => a + c.residuo_totale_cent, 0);
  const totRitirate = lista.reduce((a, c) => a + c.residuo_ritirate_cent, 0);

  function esporta() {
    scaricaCSV('conti-aperti.csv', [
      { label: 'Codice', get: (c) => c.codice },
      { label: 'Cognome', get: (c) => c.cognome },
      { label: 'Nome', get: (c) => c.nome },
      { label: 'Telefono', get: (c) => c.telefono },
      { label: 'Lavori da pagare', get: (c) => c.lavori_da_pagare },
      { label: 'Totale da pagare', get: (c) => centCSV(c.residuo_totale_cent) },
      { label: 'Su racchette ritirate', get: (c) => centCSV(c.residuo_ritirate_cent) },
      { label: 'Su racchette al circolo', get: (c) => centCSV(c.residuo_al_circolo_cent) },
      { label: 'Primo ritiro non saldato', get: (c) => (c.primo_ritiro_non_saldato ? data(c.primo_ritiro_non_saldato) : '') },
    ], lista);
  }

  return (
    <Shell title="Clienti" ruolo="segreteria" actions={
      <button className="icon-btn" aria-label="Nuovo cliente" onClick={() => setNuovo(true)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      </button>
    }>
      <label className="cerca">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, cognome, telefono o codice" aria-label="Cerca clienti" />
      </label>
      <div className="filtri">
        <button className={'pill' + (!debiti ? ' on' : '')} aria-pressed={!debiti} onClick={() => setDebiti(false)}>Tutti</button>
        <button className={'pill' + (debiti ? ' on' : '')} aria-pressed={debiti} onClick={() => setDebiti(true)}>Devono pagare</button>
      </div>

      {!righe ? <Caricamento /> : (
        <>
          {debiti && lista.length > 0 && (
            <div className="row between wrap gap8">
              <span className="small muted">Totale {euro(totale)}, di cui {euro(totRitirate)} su racchette già ritirate</span>
              <button className="link-btn" onClick={esporta}>Esporta CSV</button>
            </div>
          )}
          {!lista.length ? (
            <Vuoto>
              {debiti ? 'Nessun cliente deve pagare.' : 'Nessun cliente trovato.'}
              {!debiti && <div style={{ marginTop: 12 }}><button className="btn btn-primary" onClick={() => setNuovo(true)}>Crea nuovo cliente</button></div>}
            </Vuoto>
          ) : (
            <div className="lista">
              {lista.map((c) => (
                <Link key={c.cliente_id} href={`/clienti/${c.cliente_id}`} className="riga">
                  <div className="riga-top">
                    <div className="riga-tit">
                      <strong>{c.cognome} {c.nome}</strong>
                      <span className="small muted">
                        {c.codice}{c.telefono ? `, tel. ${c.telefono}` : ''}
                        {c.racchette_al_circolo > 0 ? `, ${c.racchette_al_circolo} al circolo` : ''}
                        {c.racchette_pronte > 0 ? ` (${c.racchette_pronte} pronte)` : ''}
                      </span>
                    </div>
                    {c.residuo_totale_cent > 0 && <strong className="num arancio-t">{euro(c.residuo_totale_cent)}</strong>}
                  </div>
                  {c.residuo_ritirate_cent > 0 && (
                    <span className="small arancio-t strong">
                      {euro(c.residuo_ritirate_cent)} su racchette ritirate, da {giorniDa(c.primo_ritiro_non_saldato)} giorni
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
      {nuovo && <NuovoClienteModal iniziale={q} onClose={() => setNuovo(false)} onCreato={(c) => router.push(`/clienti/${c.id}`)} />}
    </Shell>
  );
}

export default function Page() {
  return <Suspense fallback={<Caricamento />}><Clienti /></Suspense>;
}
