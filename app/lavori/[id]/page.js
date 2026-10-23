'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Shell from '@/components/Shell';
import { useApp } from '@/components/AppProvider';
import DatiTecnici, { tecniciDaLavoro, tecniciPerDb } from '@/components/DatiTecnici';
import PagamentoModal from '@/components/PagamentoModal';
import PrezzoModal from '@/components/PrezzoModal';
import RitiroModal from '@/components/RitiroModal';
import { Caricamento, Campo, Chips } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import {
  data, dataOra, erroreMsg, euro, fromLocalInput, nomeCliente, nuovoId, parseEuro, racchettaNome, testo, toLocalInput,
} from '@/lib/format';

const ETICHETTE_STATO = { attesa: 'in attesa', lavorazione: 'in lavorazione', pronta: 'pronta', annullata: 'annullata' };
const NOMI_CAMPI = {
  vert_marca: 'marca verticali', vert_modello: 'modello verticali', vert_calibro: 'calibro verticali',
  oriz_marca: 'marca orizzontali', oriz_modello: 'modello orizzontali', oriz_calibro: 'calibro orizzontali',
  tensione_vert: 'tensione verticali', tensione_oriz: 'tensione orizzontali', prestretch_perc: 'prestretch',
  nodi: 'nodi', corde_fornite_da: 'provenienza corde', note_tecniche: 'note tecniche', posizione: 'posizione',
  incordatore_id: 'incordatore', consegnata_at: 'data di consegna', consegna_prevista: 'consegna prevista',
  priorita: 'priorità', note_interne: 'note interne', racchetta_id: 'racchetta',
};

function descriviEvento(e, nomeOperatore) {
  const d = e.dettagli || {};
  switch (e.tipo) {
    case 'creazione': return `Lavoro inserito${d.prezzo_cent !== null && d.prezzo_cent !== undefined ? `, prezzo ${euro(d.prezzo_cent)}` : ', prezzo da definire'}`;
    case 'stato': return `Stato: ${ETICHETTE_STATO[d.da] || d.da} → ${ETICHETTE_STATO[d.a] || d.a}${d.motivo ? ` (${d.motivo})` : ''}`;
    case 'prezzo': return `Prezzo: ${d.da === null ? 'da definire' : euro(d.da)} → ${d.a === null ? 'da definire' : euro(d.a)}${d.motivo_gratuito ? ` (gratuito: ${d.motivo_gratuito})` : ''}${d.nota ? ` (${d.nota})` : ''}`;
    case 'ritiro': return `Ritirata${d.ritirato_da ? ` da ${d.ritirato_da}` : ''}${d.note ? ` (${d.note})` : ''}`;
    case 'annullo_ritiro': return `Ritiro annullato (${d.motivo})`;
    case 'incasso': return `Incasso di ${euro(d.importo_cent)} (${d.metodo})${d.totale_movimento_cent !== d.importo_cent ? `, parte di un pagamento da ${euro(d.totale_movimento_cent)}` : ''}`;
    case 'rimborso': return `Rimborso di ${euro(d.importo_cent)} (${d.metodo})`;
    case 'storno': return `Stornato ${d.tipo_movimento === 'rimborso' ? 'rimborso' : 'incasso'} di ${euro(d.importo_cent)} (${d.motivo})`;
    case 'modifica': {
      const campi = Object.keys(d).map((k) => {
        if (k === 'incordatore_id') return `incordatore: ${nomeOperatore(d[k].a)}`;
        const a = d[k]?.a;
        return `${NOMI_CAMPI[k] || k}${a !== null && a !== undefined && a !== '' && !String(k).endsWith('_at') && k !== 'racchetta_id' ? `: ${a}` : ''}`;
      });
      return `Modificati: ${campi.join(', ')}`;
    }
    default: return e.tipo;
  }
}

export default function SchedaLavoro() {
  const { id } = useParams();
  const { session, profilo, has, tick, toast, refresh, nomeOperatore, operatori } = useApp();
  const [l, setL] = useState(null);
  const [mancante, setMancante] = useState(false);
  const [lavoriConto, setLavoriConto] = useState([]);
  const [pagamenti, setPagamenti] = useState([]);
  const [eventi, setEventi] = useState([]);
  const [tec, setTec] = useState(null);
  const [serv, setServ] = useState(null);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const modificato = useRef({ tec: false, serv: false });

  useEffect(() => {
    if (!session || !profilo) return;
    const sb = supabase();
    (async () => {
      const { data: lav, error } = await sb.from('v_lavori').select('*').eq('id', id).maybeSingle();
      if (error) return toast(erroreMsg(error), 'errore');
      if (!lav) return setMancante(true);
      setL(lav);
      if (!modificato.current.tec) setTec(tecniciDaLavoro(lav));
      if (!modificato.current.serv) {
        setServ({
          consegna_prevista: toLocalInput(lav.consegna_prevista), priorita: lav.priorita, note_interne: lav.note_interne || '',
          posizione: lav.posizione || '', incordatore_id: lav.incordatore_id || '', consegnata_at: toLocalInput(lav.consegnata_at),
        });
      }
      const [lc, pl, ev] = await Promise.all([
        sb.from('v_lavori').select('*').eq('conto_id', lav.conto_id),
        sb.from('pagamenti_lavori').select('importo_cent, pagamento:pagamenti(*)').eq('lavoro_id', id),
        sb.from('eventi').select('*').eq('lavoro_id', id).order('created_at', { ascending: false }).limit(100),
      ]);
      setLavoriConto(lc.data || []);
      setPagamenti((pl.data || []).sort((a, b) => new Date(b.pagamento.created_at) - new Date(a.pagamento.created_at)));
      setEventi(ev.data || []);
    })();
  }, [id, session, profilo, tick, toast]);

  async function cambiaStato(nuovo, conMotivo) {
    let motivo = null;
    if (conMotivo) {
      motivo = window.prompt(nuovo === 'annullata' ? 'Motivo dell’annullamento:' : 'Motivo della correzione:');
      if (!testo(motivo)) return;
    }
    setBusy(true);
    const { error } = await supabase().rpc('cambia_stato_lavoro', { p_lavoro_id: id, p_stato: nuovo, p_motivo: motivo });
    setBusy(false);
    if (error) return toast(erroreMsg(error), 'errore');
    toast(`Lavoro ${ETICHETTE_STATO[nuovo]}`);
    refresh();
  }

  async function salvaTecnici() {
    const { dati, errore } = tecniciPerDb(tec);
    if (errore) return toast(errore, 'errore');
    setBusy(true);
    const { error } = await supabase().from('lavori').update(dati).eq('id', id);
    setBusy(false);
    if (error) return toast(erroreMsg(error), 'errore');
    modificato.current.tec = false;
    toast('Dati tecnici salvati');
    refresh();
  }

  async function salvaServizio() {
    const dati = { posizione: testo(serv.posizione), incordatore_id: serv.incordatore_id || null };
    if (has('segreteria')) {
      Object.assign(dati, { priorita: serv.priorita, note_interne: testo(serv.note_interne) });
      if (serv.consegna_prevista !== toLocalInput(l.consegna_prevista)) dati.consegna_prevista = fromLocalInput(serv.consegna_prevista);
      if (serv.consegnata_at && serv.consegnata_at !== toLocalInput(l.consegnata_at)) dati.consegnata_at = fromLocalInput(serv.consegnata_at);
    }
    setBusy(true);
    const { error } = await supabase().from('lavori').update(dati).eq('id', id);
    setBusy(false);
    if (error) return toast(erroreMsg(error), 'errore');
    modificato.current.serv = false;
    toast('Dettagli salvati');
    refresh();
  }

  async function annullaRitiro() {
    const motivo = window.prompt('Motivo della correzione del ritiro:');
    if (!testo(motivo)) return;
    const { error } = await supabase().rpc('annulla_ritiro', { p_lavoro_id: id, p_motivo: motivo });
    if (error) return toast(erroreMsg(error), 'errore');
    toast('Ritiro annullato');
    refresh();
  }

  async function storna(p) {
    const motivo = window.prompt(`Stornare il movimento di ${euro(p.importo_cent)} del ${data(p.data_pagamento)}? Indica il motivo:`);
    if (!testo(motivo)) return;
    const { error } = await supabase().rpc('storna_pagamento', { p_pagamento_id: p.id, p_motivo: motivo });
    if (error) return toast(erroreMsg(error), 'errore');
    toast('Movimento stornato');
    refresh();
  }

  async function rimborsa() {
    const imp = window.prompt(`Importo da rimborsare (massimo ${euro(l.pagato_cent)}):`, (l.pagato_cent / 100).toFixed(2).replace('.', ','));
    const cent = parseEuro(imp);
    if (!cent || Number.isNaN(cent)) return;
    const metodo = (window.prompt('Metodo (contanti, pos, bonifico, altro):', 'contanti') || '').trim().toLowerCase();
    if (!['contanti', 'pos', 'bonifico', 'altro'].includes(metodo)) return toast('Metodo non valido', 'errore');
    const motivo = window.prompt('Motivo del rimborso:');
    if (!testo(motivo)) return;
    const { error } = await supabase().rpc('registra_rimborso', {
      p_request_id: nuovoId(), p_lavoro_id: id, p_importo_cent: cent, p_metodo: metodo, p_motivo: motivo,
    });
    if (error) return toast(erroreMsg(error), 'errore');
    toast(`Rimborso di ${euro(cent)} registrato`);
    refresh();
  }

  if (mancante) return <Shell title="Lavoro" back="/lavori"><div className="card"><p>Lavoro non trovato.</p></div></Shell>;
  if (!l || !tec || !serv) return <Shell title="Lavoro" back="/lavori"><Caricamento /></Shell>;

  const annullata = l.stato_lavoro === 'annullata';
  const puoTecnici = (has('incordatore') || has('segreteria')) && (!annullata || has('admin'));
  const incordatori = operatori.filter((o) => o.ruoli?.includes('incordatore') || o.ruoli?.includes('admin'));

  return (
    <Shell title={l.codice} back="/lavori">
      <section className="card">
        <div className="riga-top">
          <div className="riga-tit">
            {has('segreteria')
              ? <Link href={`/clienti/${l.cliente_id}`} style={{ fontSize: 19, fontWeight: 800 }}>{nomeCliente(l)}</Link>
              : <strong style={{ fontSize: 19 }}>{nomeCliente(l)}</strong>}
            <span className="muted small">{racchettaNome(l)}{l.cliente_telefono ? `, tel. ${l.cliente_telefono}` : ''}</span>
          </div>
          {l.priorita === 'urgente' && <span className="badge-urgente">Urgente</span>}
        </div>
        <Chips l={l} />
        {annullata && <div className="errore">Annullato: {l.motivo_annullamento}</div>}

        <div className="azioni">
          {has('incordatore') && l.stato_lavoro === 'attesa' && (
            <button className="btn btn-outline" disabled={busy} onClick={() => cambiaStato('lavorazione')}>Inizia</button>
          )}
          {has('incordatore') && ['attesa', 'lavorazione'].includes(l.stato_lavoro) && (
            <button className="btn btn-primary" disabled={busy} onClick={() => cambiaStato('pronta')}>Segna come pronta</button>
          )}
          {has('incordatore') && l.stato_lavoro === 'lavorazione' && (
            <button className="btn btn-ghost" disabled={busy} onClick={() => cambiaStato('attesa')}>Rimetti in attesa</button>
          )}
          {has('segreteria') && !l.ritirato && (
            <button className="btn btn-primary" onClick={() => setModal('ritiro')}>Registra ritiro</button>
          )}
          {has('segreteria') && l.residuo_cent > 0 && (
            <button className="btn btn-outline" onClick={() => setModal('pagamento')}>Registra pagamento</button>
          )}
        </div>
      </section>

      <section className="card">
        <div className="row between">
          <h2 className="h2">Pagamento</h2>
          {has('segreteria') && !annullata && <button className="link-btn" onClick={() => setModal('prezzo')}>{l.prezzo_cent === null ? 'Imposta prezzo' : 'Modifica prezzo'}</button>}
        </div>
        <div className="totali">
          <div className="tot-box" style={{ background: 'var(--fondo)' }}>
            <span className="small strong muted">Prezzo</span>
            <strong className="num">{l.prezzo_cent === null ? 'Da definire' : euro(l.prezzo_cent)}</strong>
            {l.prezzo_cent === 0 && <span className="small muted">Gratuito: {l.motivo_gratuito}</span>}
            {l.sconto_cent > 0 && <span className="small muted">Sconto {euro(l.sconto_cent)}</span>}
          </div>
          <div className="tot-box" style={{ background: l.residuo_cent > 0 ? 'var(--arancio-chiaro)' : 'var(--verde-chiaro)', color: l.residuo_cent > 0 ? 'var(--arancio)' : 'var(--verde)' }}>
            <span className="small strong">{annullata ? 'Incassato' : 'Resta da pagare'}</span>
            <strong className="num">{annullata ? euro(l.pagato_cent) : l.residuo_cent === null ? '—' : euro(l.residuo_cent)}</strong>
            <span className="small">Pagato {euro(l.pagato_cent)}</span>
          </div>
        </div>
        {pagamenti.length > 0 && (
          <div className="stack-0">
            {pagamenti.map(({ importo_cent, pagamento: p }) => (
              <div key={p.id} className="evento">
                <div className="row between gap8">
                  <strong style={{ textDecoration: p.stornato ? 'line-through' : 'none' }}>
                    {p.tipo === 'rimborso' ? 'Rimborso ' : ''}{euro(importo_cent)}
                    {p.importo_cent !== importo_cent ? <span className="muted small"> su {euro(p.importo_cent)}</span> : null}
                  </strong>
                  {has('admin') && !p.stornato && <button className="link-btn" onClick={() => storna(p)}>Storna</button>}
                </div>
                <span className="small muted">
                  {data(p.data_pagamento)}, {p.metodo}, registrato da {nomeOperatore(p.operatore_id)}{p.nota ? `. ${p.nota}` : ''}
                  {p.stornato ? `. Stornato: ${p.storno_motivo}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        {has('admin') && l.pagato_cent > 0 && <button className="btn btn-danger btn-sm" onClick={rimborsa}>Registra rimborso</button>}
      </section>

      <section className="card">
        <h2 className="h2">Dati tecnici</h2>
        <DatiTecnici value={tec} disabled={!puoTecnici} onChange={(v) => { modificato.current.tec = true; setTec(v); }} />
        {puoTecnici && <button className="btn btn-primary" disabled={busy} onClick={salvaTecnici}>Salva dati tecnici</button>}
      </section>

      <section className="card">
        <h2 className="h2">Dettagli</h2>
        <div className="grid2">
          <Campo label="Consegnata al circolo">
            <input type="datetime-local" className="input" disabled={!has('segreteria')} value={serv.consegnata_at}
              onChange={(e) => { modificato.current.serv = true; setServ({ ...serv, consegnata_at: e.target.value }); }} />
          </Campo>
          <Campo label="Consegna prevista">
            <input type="datetime-local" className="input" disabled={!has('segreteria')} value={serv.consegna_prevista}
              onChange={(e) => { modificato.current.serv = true; setServ({ ...serv, consegna_prevista: e.target.value }); }} />
          </Campo>
          <Campo label="Priorità">
            <select className="input" disabled={!has('segreteria')} value={serv.priorita}
              onChange={(e) => { modificato.current.serv = true; setServ({ ...serv, priorita: e.target.value }); }}>
              <option value="normale">Normale</option>
              <option value="urgente">Urgente</option>
            </select>
          </Campo>
          <Campo label="Incordatore">
            <select className="input" value={serv.incordatore_id}
              onChange={(e) => { modificato.current.serv = true; setServ({ ...serv, incordatore_id: e.target.value }); }}>
              <option value="">Non assegnato</option>
              {incordatori.map((o) => <option key={o.id} value={o.id}>{[o.nome, o.cognome].filter(Boolean).join(' ') || o.email}</option>)}
            </select>
          </Campo>
          <Campo label="Posizione">
            <input className="input" value={serv.posizione} placeholder="Es. scaffale 2"
              onChange={(e) => { modificato.current.serv = true; setServ({ ...serv, posizione: e.target.value }); }} />
          </Campo>
        </div>
        {has('segreteria') && (
          <Campo label="Note interne">
            <textarea className="input" rows={2} value={serv.note_interne}
              onChange={(e) => { modificato.current.serv = true; setServ({ ...serv, note_interne: e.target.value }); }} />
          </Campo>
        )}
        <button className="btn btn-outline" disabled={busy} onClick={salvaServizio}>Salva dettagli</button>
        <dl className="kv">
          <dt>Inserito</dt><dd>{dataOra(l.created_at)}, {nomeOperatore(l.created_by)}</dd>
          {l.iniziato_at && <><dt>Iniziato</dt><dd>{dataOra(l.iniziato_at)}, {nomeOperatore(l.iniziato_by)}</dd></>}
          {l.pronta_at && <><dt>Pronta</dt><dd>{dataOra(l.pronta_at)}, {nomeOperatore(l.pronta_by)}</dd></>}
          {l.ritirato && <><dt>Ritirata</dt><dd>{dataOra(l.ritirato_at)}, consegnata da {nomeOperatore(l.ritirato_by)}{l.ritirato_da_nome ? `, ritirata da ${l.ritirato_da_nome}` : ''}</dd></>}
          {l.ritiro_note && <><dt>Note ritiro</dt><dd>{l.ritiro_note}</dd></>}
        </dl>
      </section>

      {has('admin') && (
        <section className="card">
          <h2 className="h2">Correzioni</h2>
          <p className="small muted">Ogni correzione resta nello storico con il motivo.</p>
          <div className="azioni">
            {l.stato_lavoro === 'pronta' && !l.ritirato && <button className="btn btn-ghost" onClick={() => cambiaStato('attesa', true)}>Riporta in attesa</button>}
            {l.ritirato && <button className="btn btn-ghost" onClick={annullaRitiro}>Annulla ritiro</button>}
            {!annullata && !l.ritirato && <button className="btn btn-danger" onClick={() => cambiaStato('annullata', true)}>Annulla lavoro</button>}
          </div>
        </section>
      )}

      <section className="card" style={{ gap: 0 }}>
        <h2 className="h2" style={{ marginBottom: 4 }}>Storico</h2>
        {eventi.map((e) => (
          <div key={e.id} className="evento">
            <span>{descriviEvento(e, nomeOperatore)}</span>
            <span className="small muted">{dataOra(e.created_at)}, {nomeOperatore(e.operatore_id)}</span>
          </div>
        ))}
      </section>

      {modal === 'prezzo' && <PrezzoModal lavoro={l} onClose={() => setModal(null)} onDone={() => setModal(null)} />}
      {modal === 'pagamento' && <PagamentoModal contoId={l.conto_id} lavori={lavoriConto} onClose={() => setModal(null)} onDone={() => setModal(null)} />}
      {modal === 'ritiro' && <RitiroModal lavori={lavoriConto.filter((x) => x.cliente_id === l.cliente_id)} preselezione={[l.id]} onClose={() => setModal(null)} onDone={() => setModal(null)} />}
    </Shell>
  );
}
