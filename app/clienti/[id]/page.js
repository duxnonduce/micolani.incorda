'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { useApp } from '@/components/AppProvider';
import PagamentoModal from '@/components/PagamentoModal';
import RitiroModal from '@/components/RitiroModal';
import { Caricamento, Campo, LavoroRiga, Modal } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { data, dataBreve, erroreMsg, euro, testo } from '@/lib/format';

function ModificaCliente({ cliente, onClose, onDone }) {
  const { toast, refresh } = useApp();
  const [c, setC] = useState({ nome: cliente.nome, cognome: cliente.cognome, telefono: cliente.telefono || '', note: cliente.note || '' });
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState('');

  async function salva() {
    if (!testo(c.nome) || !testo(c.cognome)) return setErrore('Nome e cognome sono obbligatori.');
    setBusy(true);
    const { error } = await supabase().from('clienti')
      .update({ nome: c.nome.trim(), cognome: c.cognome.trim(), telefono: testo(c.telefono), note: testo(c.note) })
      .eq('id', cliente.id);
    setBusy(false);
    if (error) return setErrore(erroreMsg(error));
    toast('Cliente aggiornato');
    refresh();
    onDone();
  }

  return (
    <Modal title="Modifica cliente" onClose={onClose}
      footer={<button className="btn btn-primary btn-big" disabled={busy} onClick={salva}>Salva</button>}>
      <div className="stack">
        <div className="grid2">
          <Campo label="Cognome"><input className="input" value={c.cognome} onChange={(e) => setC({ ...c, cognome: e.target.value })} /></Campo>
          <Campo label="Nome"><input className="input" value={c.nome} onChange={(e) => setC({ ...c, nome: e.target.value })} /></Campo>
        </div>
        <Campo label="Telefono"><input className="input" type="tel" value={c.telefono} onChange={(e) => setC({ ...c, telefono: e.target.value })} /></Campo>
        <Campo label="Note interne"><textarea className="input" rows={3} value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} /></Campo>
        {errore && <div className="errore">{errore}</div>}
      </div>
    </Modal>
  );
}

export default function SchedaCliente() {
  const { id } = useParams();
  const { session, profilo, has, tick, toast, nomeOperatore } = useApp();
  const [cliente, setCliente] = useState(null);
  const [saldo, setSaldo] = useState(null);
  const [lavori, setLavori] = useState([]);
  const [pagamenti, setPagamenti] = useState([]);
  const [modal, setModal] = useState(null);
  const [mostraTutti, setMostraTutti] = useState(false);

  useEffect(() => {
    if (!session || !profilo) return;
    const sb = supabase();
    (async () => {
      const { data: c, error } = await sb.from('clienti').select('*').eq('id', id).maybeSingle();
      if (error) return toast(erroreMsg(error), 'errore');
      if (!c) return setCliente(false);
      setCliente(c);
      const [s, l, p] = await Promise.all([
        sb.from('v_saldi_clienti').select('*').eq('cliente_id', id).maybeSingle(),
        sb.from('v_lavori').select('*').eq('cliente_id', id).order('consegnata_at', { ascending: false }),
        sb.from('pagamenti').select('*, pagamenti_lavori(importo_cent, lavoro_id)').eq('conto_id', c.conto_id)
          .order('created_at', { ascending: false }).limit(50),
      ]);
      setSaldo(s.data);
      setLavori(l.data || []);
      setPagamenti(p.data || []);
    })();
  }, [id, session, profilo, tick, toast]);

  if (cliente === false) return <Shell title="Cliente" back="/clienti"><div className="card"><p>Cliente non trovato.</p></div></Shell>;
  if (!cliente || !saldo) return <Shell title="Cliente" back="/clienti" ruolo="segreteria"><Caricamento /></Shell>;

  const attivi = lavori.filter((l) => !l.ritirato && l.stato_lavoro !== 'annullata');
  const chiusiAperti = lavori.filter((l) => (l.ritirato || l.stato_lavoro === 'annullata') && (l.residuo_cent > 0 || l.stato_pagamento === 'da_rimborsare' || l.stato_pagamento === 'da_definire'));
  const storico = lavori.filter((l) => !attivi.includes(l) && !chiusiAperti.includes(l));
  const codici = Object.fromEntries(lavori.map((l) => [l.id, l.codice]));

  return (
    <Shell title={`${cliente.cognome} ${cliente.nome}`} back="/clienti" ruolo="segreteria" actions={
      <button className="icon-btn" aria-label="Modifica cliente" onClick={() => setModal('modifica')}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></svg>
      </button>
    }>
      <span className="small muted" style={{ marginTop: -4 }}>
        {cliente.codice}{cliente.telefono ? <>, tel. <a href={`tel:${cliente.telefono}`}>{cliente.telefono}</a></> : ''}
        {cliente.note ? `. ${cliente.note}` : ''}
      </span>

      <section className="card">
        <div className="row between wrap gap8">
          <span className="strong muted">Totale da pagare</span>
          <strong className="num" style={{ fontSize: 30, color: saldo.residuo_totale_cent > 0 ? 'var(--arancio)' : 'var(--verde)' }}>
            {euro(saldo.residuo_totale_cent)}
          </strong>
        </div>
        <div className="totali">
          <div className="tot-box" style={{ background: 'var(--arancio-chiaro)', color: 'var(--arancio)' }}>
            <span className="small strong">Già ritirate, non saldate</span>
            <strong className="num">{euro(saldo.residuo_ritirate_cent)}</strong>
            <span className="small">{saldo.primo_ritiro_non_saldato ? `dal ${dataBreve(saldo.primo_ritiro_non_saldato)}` : 'nessuna'}</span>
          </div>
          <div className="tot-box" style={{ background: 'var(--fondo)' }}>
            <span className="small strong muted">Ancora al circolo</span>
            <strong className="num">{euro(saldo.residuo_al_circolo_cent)}</strong>
            <span className="small muted">{saldo.racchette_al_circolo} {saldo.racchette_al_circolo === 1 ? 'racchetta' : 'racchette'}</span>
          </div>
        </div>
        {saldo.lavori_prezzo_da_definire > 0 && (
          <span className="small giallo-t strong">
            {saldo.lavori_prezzo_da_definire} {saldo.lavori_prezzo_da_definire === 1 ? 'lavoro ha' : 'lavori hanno'} il prezzo da definire: non è compreso nel totale.
          </span>
        )}
        <div className="azioni">
          <button className="btn btn-primary" disabled={!saldo.residuo_totale_cent} onClick={() => setModal('pagamento')}>Registra pagamento</button>
          <button className="btn btn-outline" disabled={!saldo.racchette_al_circolo && !lavori.some((l) => !l.ritirato)} onClick={() => setModal('ritiro')}>Registra ritiro</button>
        </div>
        <Link href={`/nuovo?cliente=${cliente.id}`} className="btn btn-ghost">Nuova incordatura</Link>
      </section>

      {attivi.length > 0 && (
        <>
          <h2 className="sez-tit">Al circolo</h2>
          <div className="lista">{attivi.map((l) => <LavoroRiga key={l.id} l={l} conCliente={false} />)}</div>
        </>
      )}

      {chiusiAperti.length > 0 && (
        <>
          <h2 className="sez-tit">Ritirate con saldo aperto</h2>
          <div className="lista">{chiusiAperti.map((l) => <LavoroRiga key={l.id} l={l} conCliente={false} />)}</div>
        </>
      )}

      {storico.length > 0 && (
        <>
          <h2 className="sez-tit">Storico incordature</h2>
          <div className="lista">
            {(mostraTutti ? storico : storico.slice(0, 5)).map((l) => <LavoroRiga key={l.id} l={l} conCliente={false} />)}
          </div>
          {storico.length > 5 && !mostraTutti && <button className="link-btn" onClick={() => setMostraTutti(true)}>Mostra tutte ({storico.length})</button>}
        </>
      )}

      {pagamenti.length > 0 && (
        <>
          <h2 className="sez-tit">Pagamenti</h2>
          <div className="card" style={{ gap: 0, paddingTop: 4, paddingBottom: 4 }}>
            {pagamenti.map((p) => (
              <div key={p.id} className="evento">
                <div className="row between gap8">
                  <strong className="num" style={{ textDecoration: p.stornato ? 'line-through' : 'none' }}>
                    {p.tipo === 'rimborso' ? 'Rimborso ' : ''}{euro(p.importo_cent)}
                  </strong>
                  <span className="small muted">{data(p.data_pagamento)}, {p.metodo}</span>
                </div>
                <span className="small muted">
                  {p.pagamenti_lavori.map((a) => `${codici[a.lavoro_id] || 'lavoro'} ${euro(a.importo_cent)}`).join(', ')}.
                  {' '}Registrato da {nomeOperatore(p.operatore_id)}{p.nota ? `. ${p.nota}` : ''}
                  {p.stornato ? `. Stornato: ${p.storno_motivo}` : ''}
                </span>
              </div>
            ))}
          </div>
          {has('admin') && <span className="small muted">Per stornare un pagamento apri la scheda di uno dei lavori a cui è attribuito.</span>}
        </>
      )}

      {modal === 'modifica' && <ModificaCliente cliente={cliente} onClose={() => setModal(null)} onDone={() => setModal(null)} />}
      {modal === 'pagamento' && <PagamentoModal contoId={cliente.conto_id} lavori={lavori} onClose={() => setModal(null)} onDone={() => setModal(null)} />}
      {modal === 'ritiro' && <RitiroModal lavori={lavori} onClose={() => setModal(null)} onDone={() => setModal(null)} />}
    </Shell>
  );
}
