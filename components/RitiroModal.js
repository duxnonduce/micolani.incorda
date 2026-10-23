'use client';

import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { centToInput, distribuisci, erroreMsg, euro, nuovoId, parseEuro, racchettaNome, testo } from '@/lib/format';
import { useApp } from './AppProvider';
import Attribuzioni from './Attribuzioni';
import { Campo, Chips, Metodo, Modal } from './ui';

function PrezzoVeloce({ lavoro, onFatto }) {
  const { toast, refresh } = useApp();
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  async function salva() {
    const c = parseEuro(v);
    if (c === null || Number.isNaN(c)) return toast('Scrivi il prezzo', 'errore');
    setBusy(true);
    const { error } = await supabase().rpc('imposta_prezzo', {
      p_lavoro_id: lavoro.id, p_prezzo_cent: c, p_motivo_gratuito: c === 0 ? 'Omaggio' : null,
    });
    setBusy(false);
    if (error) return toast(erroreMsg(error), 'errore');
    refresh();
    onFatto();
  }
  return (
    <div className="row gap8">
      <input className="input input-sm num" style={{ flex: 1, width: 'auto', textAlign: 'left' }} inputMode="decimal"
        placeholder="Prezzo €" aria-label={`Prezzo ${lavoro.codice}`} value={v} onChange={(e) => setV(e.target.value)} />
      <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={salva}>Imposta prezzo</button>
    </div>
  );
}

export default function RitiroModal({ lavori, preselezione, onClose, onDone }) {
  const { toast, refresh } = useApp();
  const contoId = lavori[0]?.conto_id;

  const daRitirare = useMemo(
    () => lavori.filter((l) => !l.ritirato).sort((a, b) => new Date(a.consegnata_at) - new Date(b.consegnata_at)),
    [lavori]
  );
  const apertiConto = useMemo(
    () => lavori.filter((l) => l.residuo_cent > 0).sort((a, b) => new Date(a.consegnata_at) - new Date(b.consegnata_at)),
    [lavori]
  );
  const debitoRitirate = lavori.filter((l) => l.ritirato && l.residuo_cent > 0).reduce((a, l) => a + l.residuo_cent, 0);
  const nRitirateAperte = lavori.filter((l) => l.ritirato && l.residuo_cent > 0).length;

  const [sel, setSel] = useState(() => {
    const ok = (l) => l.prezzo_cent !== null || l.stato_lavoro === 'annullata';
    if (preselezione?.length) return daRitirare.filter((l) => preselezione.includes(l.id) && ok(l)).map((l) => l.id);
    return daRitirare.filter((l) => l.stato_lavoro === 'pronta' && ok(l)).map((l) => l.id);
  });
  const [modo, setModo] = useState('paga');
  const [importo, setImporto] = useState('');
  const [metodo, setMetodo] = useState('contanti');
  const [ritiratoDa, setRitiratoDa] = useState('');
  const [note, setNote] = useState('');
  const [manuale, setManuale] = useState(false);
  const [manualeVal, setManualeVal] = useState({});
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState('');
  const reqId = useRef(nuovoId());

  const selezionati = daRitirare.filter((l) => sel.includes(l.id));
  const residuoSel = selezionati.reduce((a, l) => a + Math.max(l.residuo_cent || 0, 0), 0);
  const giaPagate = selezionati.length > 0 && residuoSel === 0;
  const nonSelezionabili = selezionati.some((l) => l.prezzo_cent === null && l.stato_lavoro !== 'annullata');

  const centParte = parseEuro(importo);
  const parteValida = centParte && !Number.isNaN(centParte);
  const autoParte = useMemo(() => distribuisci(apertiConto, parteValida ? centParte : 0), [apertiConto, centParte, parteValida]);
  const attribParte = manuale ? manualeVal : autoParte;

  const totaleAperto = apertiConto.reduce((a, l) => a + l.residuo_cent, 0);
  let incasso = 0;
  if (!giaPagate && modo === 'paga') incasso = residuoSel;
  if (!giaPagate && modo === 'parte' && parteValida) incasso = centParte;
  const restaDopo = totaleAperto - incasso;

  function toggle(id) {
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function cambiaManuale(m) {
    if (m) setManualeVal(autoParte);
    setManuale(m);
  }

  async function conferma() {
    setErrore('');
    if (!sel.length) return setErrore('Seleziona almeno una racchetta.');
    let pagamento = null;
    if (!giaPagate && modo === 'paga' && residuoSel > 0) {
      pagamento = {
        importo_cent: residuoSel,
        metodo,
        attribuzioni: selezionati.filter((l) => l.residuo_cent > 0).map((l) => ({ lavoro_id: l.id, importo_cent: l.residuo_cent })),
      };
    }
    if (!giaPagate && modo === 'parte') {
      if (!parteValida) return setErrore('Inserisci l’importo incassato.');
      if (centParte > totaleAperto) return setErrore(`L’importo supera il totale da pagare (${euro(totaleAperto)}).`);
      const righe = Object.entries(attribParte).filter(([, v]) => v > 0).map(([lavoro_id, importo_cent]) => ({ lavoro_id, importo_cent }));
      if (righe.reduce((a, r) => a + r.importo_cent, 0) !== centParte) return setErrore('La ripartizione non corrisponde all’importo.');
      pagamento = { importo_cent: centParte, metodo, attribuzioni: righe };
    }
    setBusy(true);
    const { error } = await supabase().rpc('registra_ritiro', {
      p_request_id: reqId.current,
      p_lavori: sel,
      p_ritirato_da: testo(ritiratoDa),
      p_note: testo(note),
      p_pagamento: pagamento,
    });
    setBusy(false);
    if (error) return setErrore(erroreMsg(error));
    toast(
      `${sel.length === 1 ? 'Ritiro registrato' : `${sel.length} ritiri registrati`}` +
      (pagamento ? `, incassati ${euro(pagamento.importo_cent)}` : ', nessun pagamento')
    );
    refresh();
    onDone?.();
  }

  const etichetta = giaPagate
    ? 'Registra ritiro'
    : modo === 'paga' ? `Ritira e incassa ${euro(residuoSel)}`
    : modo === 'parte' ? (parteValida ? `Ritira e incassa ${euro(centParte)}` : 'Ritira e incassa')
    : 'Ritira senza pagare';

  return (
    <Modal
      title="Registra ritiro"
      onClose={onClose}
      footer={
        <>
          {sel.length > 0 && (
            <span className="small muted centro-t">
              Dopo il ritiro resteranno da pagare <strong className={restaDopo > 0 ? 'arancio-t' : ''}>{euro(restaDopo)}</strong>
            </span>
          )}
          <button className="btn btn-primary btn-big" disabled={busy || !sel.length || nonSelezionabili} onClick={conferma}>
            {busy ? 'Salvataggio…' : etichetta}
          </button>
        </>
      }
    >
      <div className="stack">
        {debitoRitirate > 0 && (
          <div className="avviso-arancio">
            Ha già {euro(debitoRitirate)} da pagare su {nRitirateAperte} {nRitirateAperte === 1 ? 'racchetta ritirata' : 'racchette ritirate'}.
          </div>
        )}

        {!daRitirare.length ? (
          <p className="muted">Nessuna racchetta da ritirare per questo cliente.</p>
        ) : (
          <div className="card card-flat">
            {daRitirare.map((l) => {
              const bloccata = l.prezzo_cent === null && l.stato_lavoro !== 'annullata';
              return (
                <div key={l.id} className="check-riga">
                  <label className="check-label">
                    <input type="checkbox" checked={sel.includes(l.id)} disabled={bloccata} onChange={() => toggle(l.id)} />
                    <span className="stack-0">
                      <strong>{racchettaNome(l)}</strong>
                      <span className="small muted">{l.codice}, {l.prezzo_cent === null ? 'prezzo da definire' : euro(l.prezzo_cent)}</span>
                    </span>
                  </label>
                  <Chips l={l} />
                  {bloccata && <PrezzoVeloce lavoro={l} onFatto={() => setSel((s) => (s.includes(l.id) ? s : [...s, l.id]))} />}
                </div>
              );
            })}
          </div>
        )}

        {sel.length > 0 && giaPagate && <div className="avviso-verde">Le racchette selezionate sono già pagate.</div>}

        {sel.length > 0 && !giaPagate && (
          <>
            <div className="opzioni" role="radiogroup" aria-label="Pagamento al ritiro">
              <label className={'opzione' + (modo === 'paga' ? ' on' : '')}>
                <input type="radio" name="modo" checked={modo === 'paga'} onChange={() => setModo('paga')} />
                <span className="flex1 strong">Ritira e paga</span>
                <span className="num muted">{euro(residuoSel)}</span>
              </label>
              <label className={'opzione' + (modo === 'nonpaga' ? ' on' : '')}>
                <input type="radio" name="modo" checked={modo === 'nonpaga'} onChange={() => setModo('nonpaga')} />
                <span className="flex1 strong">Ritira senza pagare</span>
              </label>
              <label className={'opzione' + (modo === 'parte' ? ' on' : '')}>
                <input type="radio" name="modo" checked={modo === 'parte'} onChange={() => { setModo('parte'); if (!importo) setImporto(''); }} />
                <span className="flex1 strong">Ritira e paga una parte</span>
              </label>
            </div>

            {modo === 'parte' && (
              <Campo label="Importo incassato">
                <input className="input input-big num" inputMode="decimal" placeholder={centToInput(residuoSel)} value={importo} onChange={(e) => setImporto(e.target.value)} />
              </Campo>
            )}
            {modo !== 'nonpaga' && <Campo label="Metodo"><Metodo value={metodo} onChange={setMetodo} /></Campo>}
            {modo === 'parte' && parteValida && (
              <Attribuzioni lavori={apertiConto} value={attribParte} onChange={setManualeVal} totale={centParte} manuale={manuale} setManuale={cambiaManuale} />
            )}
          </>
        )}

        <div className="grid2">
          <Campo label="Ritira per conto del cliente">
            <input className="input" value={ritiratoDa} onChange={(e) => setRitiratoDa(e.target.value)} placeholder="Facoltativo" />
          </Campo>
          <Campo label="Note">
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Facoltative" />
          </Campo>
        </div>
        {errore && <div className="errore">{errore}</div>}
      </div>
    </Modal>
  );
}
