'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { useApp } from '@/components/AppProvider';
import NuovoClienteModal from '@/components/NuovoClienteModal';
import { Caricamento, Campo } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { corrisponde, erroreMsg, nuovoId, paroleRicerca, parseNum, testo } from '@/lib/format';

const vuota = { marca: '', modello: '', corde: '', tensione: '' };

function CercaCliente({ onScelto }) {
  const [q, setQ] = useState('');
  const [risultati, setRisultati] = useState([]);
  const [nuovo, setNuovo] = useState(false);
  const parole = paroleRicerca(q);
  const prima = parole[0] || '';

  useEffect(() => {
    let query = supabase().from('clienti').select('id, nome, cognome, telefono');
    if (prima) {
      query = query.or(`nome.ilike.*${prima}*,cognome.ilike.*${prima}*,telefono.ilike.*${prima}*`).order('cognome').order('nome').limit(40);
    } else {
      query = query.order('created_at', { ascending: false }).limit(8);
    }
    const t = setTimeout(() => query.then(({ data }) => setRisultati(data || [])), 200);
    return () => clearTimeout(t);
  }, [prima]);

  const lista = risultati.filter((c) => corrisponde(parole, [c.nome, c.cognome, c.telefono])).slice(0, 10);

  return (
    <section className="card">
      <h2 className="h2">Di chi è la racchetta?</h2>
      <label className="cerca" style={{ border: '1.5px solid var(--bordo)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca nome o cognome" aria-label="Cerca cliente" />
      </label>
      <button type="button" className="btn btn-outline" onClick={() => setNuovo(true)}>+ Nuovo cliente</button>
      <div className="stack-0">
        {lista.map((c) => (
          <button key={c.id} type="button" className="opzione" style={{ marginBottom: 6, textAlign: 'left' }} onClick={() => onScelto(c)}>
            <strong className="flex1">{c.nome} {c.cognome}</strong>
            {c.telefono && <span className="small muted">{c.telefono}</span>}
          </button>
        ))}
        {prima && !lista.length && <span className="small muted">Nessun cliente trovato. Crealo con “Nuovo cliente”.</span>}
      </div>
      {nuovo && <NuovoClienteModal iniziale={q} onClose={() => setNuovo(false)} onCreato={(c) => { setNuovo(false); onScelto(c); }} />}
    </section>
  );
}

function Nuovo() {
  const sp = useSearchParams();
  const router = useRouter();
  const { session, profilo, toast, refresh } = useApp();
  const [cliente, setCliente] = useState(null);
  const [r, setR] = useState(vuota);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState('');
  const reqId = useRef(nuovoId());

  useEffect(() => {
    const cid = sp.get('cliente');
    if (!cid || !session || !profilo) return;
    supabase().from('clienti').select('id, nome, cognome, telefono').eq('id', cid).maybeSingle()
      .then(({ data }) => data && setCliente(data));
  }, [sp, session, profilo]);

  const set = (k) => (e) => setR({ ...r, [k]: e.target.value });

  async function salva(altra) {
    setErrore('');
    if (!cliente) return setErrore('Scegli il cliente.');
    const tensione = parseNum(r.tensione);
    if (Number.isNaN(tensione) || (tensione !== null && (tensione < 5 || tensione > 40))) {
      return setErrore('La tensione deve essere un numero in kg, tra 5 e 40.');
    }
    const corde = testo(r.corde);
    setBusy(true);
    const { data, error } = await supabase().rpc('crea_lavori', {
      p_request_id: reqId.current,
      p_cliente_id: cliente.id,
      p_lavori: [{
        racchetta: { marca: testo(r.marca), modello: testo(r.modello) },
        vert_marca: corde, oriz_marca: corde,
        tensione_vert: tensione, tensione_oriz: tensione,
      }],
    });
    setBusy(false);
    if (error) return setErrore(erroreMsg(error));
    reqId.current = nuovoId();
    toast(`${data?.lavori?.[0]?.codice || 'Racchetta'} inserita: in attesa`);
    refresh();
    if (altra) setR(vuota);
    else router.push('/coda');
  }

  return (
    <Shell title="Nuova incordatura" ruolo={['segreteria', 'incordatore']}>
      {!cliente ? <CercaCliente onScelto={setCliente} /> : (
        <>
          <section className="card">
            <div className="row between gap8">
              <div className="stack-0">
                <span className="small strong muted">Cliente</span>
                <strong style={{ fontSize: 19 }}>{cliente.nome} {cliente.cognome}</strong>
              </div>
              <button className="link-btn" onClick={() => setCliente(null)}>Cambia</button>
            </div>
          </section>

          <section className="card">
            <h2 className="h2">Racchetta</h2>
            <div className="grid2">
              <Campo label="Marca"><input className="input" value={r.marca} onChange={set('marca')} placeholder="Babolat" /></Campo>
              <Campo label="Modello"><input className="input" value={r.modello} onChange={set('modello')} placeholder="Pure Aero" /></Campo>
            </div>
            <Campo label="Corde"><input className="input" value={r.corde} onChange={set('corde')} placeholder="RPM Blast 1.25" /></Campo>
            <Campo label="Tensione (kg)"><input className="input input-big num" inputMode="decimal" value={r.tensione} onChange={set('tensione')} placeholder="24" /></Campo>
          </section>

          {errore && <div className="errore">{errore}</div>}
          <button className="btn btn-primary btn-big" disabled={busy} onClick={() => salva(false)}>{busy ? 'Salvataggio…' : 'Salva'}</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => salva(true)}>Salva e aggiungi un’altra racchetta</button>
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  return <Suspense fallback={<Caricamento />}><Nuovo /></Suspense>;
}
