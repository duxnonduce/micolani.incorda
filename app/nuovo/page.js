'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Shell from '@/components/Shell';
import { useApp } from '@/components/AppProvider';
import DatiTecnici, { tecniciDaLavoro, tecniciPerDb, tecniciVuoti } from '@/components/DatiTecnici';
import NuovoClienteModal from '@/components/NuovoClienteModal';
import { Caricamento, Campo } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import {
  corrisponde, erroreMsg, euro, fromLocalInput, nuovoId, paroleRicerca, parseEuro, testo,
} from '@/lib/format';

let chiave = 0;
function nuovaRiga(base) {
  chiave += 1;
  return {
    key: chiave,
    racchetta_id: '',
    marca: base?.marca || '',
    modello: base?.modello || '',
    identificazione: '',
    tec: base?.tec ? { ...base.tec } : tecniciVuoti(),
    prezzo: base?.prezzo ?? '',
    motivo_gratuito: '',
    priorita: base?.priorita || 'normale',
    consegna_prevista: base?.consegna_prevista || '',
    note_interne: '',
    posizione: '',
    incordatore_id: base?.incordatore_id || '',
    aperta: true,
  };
}

function CercaCliente({ onScelto }) {
  const [q, setQ] = useState('');
  const [risultati, setRisultati] = useState([]);
  const [nuovo, setNuovo] = useState(false);
  const parole = paroleRicerca(q);
  const prima = parole[0] || '';

  useEffect(() => {
    if (!prima) return setRisultati([]);
    const t = setTimeout(() => {
      supabase().from('v_saldi_clienti').select('*')
        .or(`nome.ilike.*${prima}*,cognome.ilike.*${prima}*,codice.ilike.*${prima}*,telefono.ilike.*${prima}*`)
        .order('cognome').limit(30)
        .then(({ data }) => setRisultati(data || []));
    }, 250);
    return () => clearTimeout(t);
  }, [prima]);

  const lista = risultati.filter((c) => corrisponde(parole, [c.nome, c.cognome, c.codice, c.telefono])).slice(0, 8);

  return (
    <section className="card">
      <h2 className="h2">Cliente</h2>
      <label className="cerca" style={{ border: '1.5px solid var(--bordo)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per cognome, nome o telefono" aria-label="Cerca cliente" autoFocus />
      </label>
      {lista.length > 0 && (
        <div className="stack-0">
          {lista.map((c) => (
            <button key={c.cliente_id} type="button" className="opzione" style={{ marginBottom: 6, textAlign: 'left' }} onClick={() => onScelto({ id: c.cliente_id, nome: c.nome, cognome: c.cognome, codice: c.codice, telefono: c.telefono, residuo: c.residuo_totale_cent })}>
              <span className="flex1 stack-0">
                <strong>{c.cognome} {c.nome}</strong>
                <span className="small muted">{c.codice}{c.telefono ? `, tel. ${c.telefono}` : ''}</span>
              </span>
              {c.residuo_totale_cent > 0 && <span className="small strong arancio-t">deve {euro(c.residuo_totale_cent)}</span>}
            </button>
          ))}
        </div>
      )}
      {prima && !lista.length && <span className="small muted">Nessun cliente trovato.</span>}
      <button type="button" className="btn btn-outline" onClick={() => setNuovo(true)}>Nuovo cliente</button>
      {nuovo && <NuovoClienteModal iniziale={q} onClose={() => setNuovo(false)} onCreato={(c) => { setNuovo(false); onScelto(c); }} />}
    </section>
  );
}

function Nuovo() {
  const sp = useSearchParams();
  const router = useRouter();
  const { session, profilo, toast, operatori, refresh, has } = useApp();
  const [cliente, setCliente] = useState(null);
  const [racchette, setRacchette] = useState([]);
  const [righe, setRighe] = useState([nuovaRiga()]);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState('');
  const reqId = useRef(nuovoId());

  useEffect(() => {
    const cid = sp.get('cliente');
    if (!cid || !session || !profilo) return;
    supabase().from('clienti').select('id, nome, cognome, codice, telefono').eq('id', cid).maybeSingle()
      .then(({ data }) => data && setCliente(data));
  }, [sp, session, profilo]);

  useEffect(() => {
    if (!cliente) return setRacchette([]);
    supabase().from('racchette').select('*').eq('cliente_id', cliente.id).order('created_at', { ascending: false })
      .then(({ data }) => setRacchette(data || []));
  }, [cliente]);

  const incordatori = operatori.filter((o) => o.ruoli?.includes('incordatore') || o.ruoli?.includes('admin'));
  const aggiorna = (key, patch) => setRighe((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function scegliRacchetta(r, racchettaId) {
    if (!racchettaId) return aggiorna(r.key, { racchetta_id: '' });
    const { data } = await supabase().from('lavori').select('*').eq('racchetta_id', racchettaId)
      .order('consegnata_at', { ascending: false }).limit(1).maybeSingle();
    aggiorna(r.key, { racchetta_id: racchettaId, ...(data ? { tec: tecniciDaLavoro(data) } : {}) });
    if (data) toast('Dati tecnici copiati dall’ultima incordatura');
  }

  function aggiungi() {
    const ultima = righe[righe.length - 1];
    setRighe([...righe.map((r) => ({ ...r, aperta: false })), nuovaRiga({
      marca: ultima.racchetta_id ? '' : ultima.marca,
      modello: ultima.racchetta_id ? '' : ultima.modello,
      tec: ultima.tec, prezzo: ultima.prezzo,
      priorita: ultima.priorita, consegna_prevista: ultima.consegna_prevista, incordatore_id: ultima.incordatore_id,
    })]);
  }

  async function salva() {
    setErrore('');
    if (!cliente) return setErrore('Scegli o crea il cliente.');
    const payload = [];
    for (let i = 0; i < righe.length; i++) {
      const r = righe[i];
      const n = righe.length > 1 ? `Racchetta ${i + 1}: ` : '';
      const { dati, errore: e } = tecniciPerDb(r.tec);
      if (e) return setErrore(n + e);
      // prezzo vuoto = da definire
      const prezzo = parseEuro(r.prezzo);
      if (Number.isNaN(prezzo)) return setErrore(`${n}il prezzo non è un numero valido.`);
      payload.push({
        ...(r.racchetta_id
          ? { racchetta_id: r.racchetta_id }
          : { racchetta: { marca: testo(r.marca), modello: testo(r.modello), identificazione: testo(r.identificazione) } }),
        ...dati,
        prezzo_cent: prezzo,
        motivo_gratuito: prezzo === 0 ? testo(r.motivo_gratuito) || 'Omaggio' : null,
        priorita: r.priorita,
        consegna_prevista: fromLocalInput(r.consegna_prevista),
        note_interne: testo(r.note_interne),
        posizione: testo(r.posizione),
        incordatore_id: r.incordatore_id || null,
      });
    }
    setBusy(true);
    const { data, error } = await supabase().rpc('crea_lavori', {
      p_request_id: reqId.current, p_cliente_id: cliente.id, p_lavori: payload,
    });
    setBusy(false);
    if (error) return setErrore(erroreMsg(error));
    const codici = (data?.lavori || []).map((x) => x.codice).join(', ');
    toast(`Inserit${payload.length === 1 ? 'o' : 'i'} ${codici}`);
    refresh();
    router.push(has('segreteria') ? `/clienti/${cliente.id}` : '/coda');
  }

  return (
    <Shell title="Nuova incordatura" ruolo={['segreteria', 'incordatore']}>
      {!cliente ? <CercaCliente onScelto={setCliente} /> : (
        <section className="card">
          <div className="row between gap8">
            <div className="stack-0">
              <span className="small strong muted">Cliente</span>
              <strong style={{ fontSize: 18 }}>{cliente.cognome} {cliente.nome}</strong>
              <span className="small muted">{cliente.codice}{cliente.telefono ? `, tel. ${cliente.telefono}` : ''}</span>
            </div>
            <button className="link-btn" onClick={() => { setCliente(null); setRighe([nuovaRiga()]); }}>Cambia</button>
          </div>
          {cliente.residuo > 0 && <div className="avviso-arancio">Ha già {euro(cliente.residuo)} da pagare.</div>}
        </section>
      )}

      {cliente && righe.map((r, i) => (
        <section key={r.key} className="card">
          <div className="row between gap8">
            <h2 className="h2">Racchetta {righe.length > 1 ? i + 1 : ''}</h2>
            <div className="row gap8">
              {!r.aperta && <button className="link-btn" onClick={() => aggiorna(r.key, { aperta: true })}>Modifica</button>}
              {righe.length > 1 && <button className="link-btn" style={{ color: 'var(--rosso)' }} onClick={() => setRighe(righe.filter((x) => x.key !== r.key))}>Rimuovi</button>}
            </div>
          </div>

          {!r.aperta ? (
            <span className="small">
              {r.racchetta_id
                ? (() => { const x = racchette.find((y) => y.id === r.racchetta_id); return x ? [x.marca, x.modello, x.identificazione].filter(Boolean).join(' ') || 'Racchetta registrata' : 'Racchetta registrata'; })()
                : [r.marca, r.modello, r.identificazione].filter(Boolean).join(' ') || 'Racchetta'}
              {', '}{testo(r.prezzo) ? `${r.prezzo} €` : 'prezzo da definire'}
            </span>
          ) : (
            <>
              {racchette.length > 0 && (
                <Campo label="Racchetta già registrata">
                  <select className="input" value={r.racchetta_id} onChange={(e) => scegliRacchetta(r, e.target.value)}>
                    <option value="">Nuova racchetta</option>
                    {racchette.map((x) => (
                      <option key={x.id} value={x.id}>{[x.marca, x.modello, x.identificazione].filter(Boolean).join(' ') || 'Racchetta senza dettagli'}</option>
                    ))}
                  </select>
                </Campo>
              )}
              {!r.racchetta_id && (
                <div className="grid3">
                  <Campo label="Marca"><input className="input" value={r.marca} onChange={(e) => aggiorna(r.key, { marca: e.target.value })} /></Campo>
                  <Campo label="Modello"><input className="input" value={r.modello} onChange={(e) => aggiorna(r.key, { modello: e.target.value })} /></Campo>
                  <Campo label="Come riconoscerla"><input className="input" value={r.identificazione} placeholder="Colore, numero…" onChange={(e) => aggiorna(r.key, { identificazione: e.target.value })} /></Campo>
                </div>
              )}

              <DatiTecnici value={r.tec} onChange={(tec) => aggiorna(r.key, { tec })} />

              <Campo label="Prezzo" nota="Se lo lasci vuoto resta da definire">
                <input className="input input-big num" inputMode="decimal" value={r.prezzo}
                  placeholder="Da definire" onChange={(e) => aggiorna(r.key, { prezzo: e.target.value })} />
              </Campo>
              {parseEuro(r.prezzo) === 0 && (
                <Campo label="Motivo del lavoro gratuito" nota="Facoltativo">
                  <input className="input" value={r.motivo_gratuito} onChange={(e) => aggiorna(r.key, { motivo_gratuito: e.target.value })} placeholder="Omaggio" />
                </Campo>
              )}

              <div className="grid2">
                <Campo label="Consegna prevista">
                  <input type="datetime-local" className="input" value={r.consegna_prevista} onChange={(e) => aggiorna(r.key, { consegna_prevista: e.target.value })} />
                </Campo>
                <Campo label="Priorità">
                  <div className="segmenti">
                    {['normale', 'urgente'].map((p) => (
                      <button key={p} type="button" className={'seg' + (r.priorita === p ? ' on' : '')} aria-pressed={r.priorita === p}
                        onClick={() => aggiorna(r.key, { priorita: p })}>{p === 'normale' ? 'Normale' : 'Urgente'}</button>
                    ))}
                  </div>
                </Campo>
                <Campo label="Incordatore">
                  <select className="input" value={r.incordatore_id} onChange={(e) => aggiorna(r.key, { incordatore_id: e.target.value })}>
                    <option value="">Da assegnare</option>
                    {incordatori.map((o) => <option key={o.id} value={o.id}>{[o.nome, o.cognome].filter(Boolean).join(' ') || o.email}</option>)}
                  </select>
                </Campo>
                <Campo label="Posizione">
                  <input className="input" value={r.posizione} placeholder="Es. gancio 4" onChange={(e) => aggiorna(r.key, { posizione: e.target.value })} />
                </Campo>
              </div>
              <Campo label="Note interne">
                <input className="input" value={r.note_interne} onChange={(e) => aggiorna(r.key, { note_interne: e.target.value })} placeholder="Facoltative" />
              </Campo>
            </>
          )}
        </section>
      ))}

      {cliente && (
        <>
          <button className="btn btn-outline" onClick={aggiungi}>Aggiungi un’altra racchetta</button>
          <span className="small muted centro-t">La nuova racchetta riprende corde, tensioni e prezzo dell’ultima.</span>
          {errore && <div className="errore">{errore}</div>}
          <button className="btn btn-primary btn-big" disabled={busy} onClick={salva}>
            {busy ? 'Salvataggio…' : righe.length === 1 ? 'Inserisci incordatura' : `Inserisci ${righe.length} incordature`}
          </button>
        </>
      )}
    </Shell>
  );
}

export default function Page() {
  return <Suspense fallback={<Caricamento />}><Nuovo /></Suspense>;
}
