'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { useApp } from '@/components/AppProvider';
import { Caricamento, LavoroRiga, Vuoto } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { centCSV, corrisponde, dataOra, erroreMsg, euro, paroleRicerca, scaricaCSV } from '@/lib/format';

function Elenco() {
  const sp = useSearchParams();
  const { session, profilo, tick, toast, operatori } = useApp();
  const [q, setQ] = useState('');
  const [f, setF] = useState({
    stato: sp.get('stato') || '',
    ritiro: sp.get('ritiro') || '',
    pagamento: sp.get('pagamento') || '',
    urgenti: sp.get('urgenti') === '1',
    incordatore: '',
    dal: '',
    al: '',
  });
  const [lavori, setLavori] = useState(null);

  const parole = paroleRicerca(q);
  const prima = parole[0] || '';

  useEffect(() => {
    if (!session || !profilo) return;
    let query = supabase().from('v_lavori').select('*').order('consegnata_at', { ascending: false }).limit(400);
    if (f.stato) query = query.eq('stato_lavoro', f.stato);
    if (f.ritiro === 'si') query = query.eq('ritirato', true);
    if (f.ritiro === 'no') query = query.eq('ritirato', false);
    if (f.pagamento === 'aperti') query = query.in('stato_pagamento', ['da_pagare', 'parziale']);
    else if (f.pagamento) query = query.eq('stato_pagamento', f.pagamento);
    if (f.urgenti) query = query.eq('priorita', 'urgente');
    if (f.incordatore) query = query.eq('incordatore_id', f.incordatore);
    if (f.dal) query = query.gte('consegnata_at', new Date(f.dal + 'T00:00:00').toISOString());
    if (f.al) query = query.lt('consegnata_at', new Date(new Date(f.al + 'T00:00:00').getTime() + 86400000).toISOString());
    if (prima) query = query.or(`cliente_nome.ilike.*${prima}*,cliente_cognome.ilike.*${prima}*,codice.ilike.*${prima}*,racchetta_identificazione.ilike.*${prima}*`);
    const t = setTimeout(() => {
      query.then(({ data, error }) => {
        if (error) return toast(erroreMsg(error), 'errore');
        setLavori(data || []);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [session, profilo, tick, f, prima, toast]);

  const lista = (lavori || []).filter((l) =>
    corrisponde(parole, [l.cliente_nome, l.cliente_cognome, l.codice, l.racchetta_identificazione, l.racchetta_marca, l.racchetta_modello])
  );
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const incordatori = operatori.filter((o) => o.ruoli?.includes('incordatore') || o.ruoli?.includes('admin'));

  function esporta() {
    scaricaCSV('lavori.csv', [
      { label: 'Codice', get: (l) => l.codice },
      { label: 'Cognome', get: (l) => l.cliente_cognome },
      { label: 'Nome', get: (l) => l.cliente_nome },
      { label: 'Racchetta', get: (l) => [l.racchetta_marca, l.racchetta_modello, l.racchetta_identificazione].filter(Boolean).join(' ') },
      { label: 'Consegnata', get: (l) => dataOra(l.consegnata_at) },
      { label: 'Consegna prevista', get: (l) => (l.consegna_prevista ? dataOra(l.consegna_prevista) : '') },
      { label: 'Stato', get: (l) => l.stato_lavoro },
      { label: 'Ritirata', get: (l) => (l.ritirato ? dataOra(l.ritirato_at) : 'no') },
      { label: 'Pagamento', get: (l) => l.stato_pagamento },
      { label: 'Prezzo', get: (l) => centCSV(l.prezzo_cent) },
      { label: 'Pagato', get: (l) => centCSV(l.pagato_cent) },
      { label: 'Residuo', get: (l) => centCSV(l.residuo_cent) },
    ], lista);
  }

  const totResiduo = lista.reduce((a, l) => a + (l.residuo_cent > 0 ? l.residuo_cent : 0), 0);

  return (
    <Shell title="Lavori">
      <label className="cerca">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cliente, codice o racchetta" aria-label="Cerca lavori" />
      </label>
      <div className="filtri">
        <select value={f.stato} onChange={set('stato')} aria-label="Stato lavorazione">
          <option value="">Ogni stato</option>
          <option value="attesa">In attesa</option>
          <option value="lavorazione">In lavorazione</option>
          <option value="pronta">Pronta</option>
          <option value="annullata">Annullata</option>
        </select>
        <select value={f.ritiro} onChange={set('ritiro')} aria-label="Ritiro">
          <option value="">Ritirate e no</option>
          <option value="no">Al circolo</option>
          <option value="si">Ritirate</option>
        </select>
        <select value={f.pagamento} onChange={set('pagamento')} aria-label="Pagamento">
          <option value="">Ogni pagamento</option>
          <option value="aperti">Da pagare o parziali</option>
          <option value="da_definire">Prezzo da definire</option>
          <option value="pagata">Pagate</option>
          <option value="da_rimborsare">Da rimborsare</option>
        </select>
        <select value={f.incordatore} onChange={set('incordatore')} aria-label="Incordatore">
          <option value="">Ogni incordatore</option>
          {incordatori.map((o) => <option key={o.id} value={o.id}>{[o.nome, o.cognome].filter(Boolean).join(' ') || o.email}</option>)}
        </select>
        <button className={'pill' + (f.urgenti ? ' on' : '')} aria-pressed={f.urgenti} onClick={() => setF({ ...f, urgenti: !f.urgenti })}>Urgenti</button>
      </div>
      <div className="row gap8 wrap">
        <label className="row gap8 small strong muted">Dal <input type="date" className="input" style={{ width: 160, minHeight: 40 }} value={f.dal} onChange={set('dal')} /></label>
        <label className="row gap8 small strong muted">al <input type="date" className="input" style={{ width: 160, minHeight: 40 }} value={f.al} onChange={set('al')} /></label>
      </div>

      {!lavori ? <Caricamento /> : (
        <>
          <div className="row between">
            <span className="small muted">{lista.length} lavori{totResiduo > 0 ? `, da incassare ${euro(totResiduo)}` : ''}</span>
            {lista.length > 0 && <button className="link-btn" onClick={esporta}>Esporta CSV</button>}
          </div>
          {!lista.length ? <Vuoto>Nessun lavoro con questi filtri.</Vuoto> : (
            <div className="lista">{lista.map((l) => <LavoroRiga key={l.id} l={l} />)}</div>
          )}
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  return <Suspense fallback={<Caricamento />}><Elenco /></Suspense>;
}
