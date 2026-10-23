'use client';

import { useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { centToInput, distribuisci, erroreMsg, euro, nuovoId, oggiISO, parseEuro, testo } from '@/lib/format';
import { useApp } from './AppProvider';
import Attribuzioni from './Attribuzioni';
import { Campo, Metodo, Modal } from './ui';

// lavori: tutti i lavori del conto; usa quelli con residuo > 0
export default function PagamentoModal({ contoId, lavori, onClose, onDone, soloLavoro }) {
  const { toast, refresh } = useApp();
  const aperti = useMemo(
    () => lavori
      .filter((l) => l.residuo_cent > 0 && (!soloLavoro || l.id === soloLavoro))
      .sort((a, b) => new Date(a.consegnata_at) - new Date(b.consegnata_at)),
    [lavori, soloLavoro]
  );
  const totaleAperto = aperti.reduce((a, l) => a + l.residuo_cent, 0);

  const [importo, setImporto] = useState(centToInput(totaleAperto));
  const [dataP, setDataP] = useState(oggiISO());
  const [metodo, setMetodo] = useState('contanti');
  const [nota, setNota] = useState('');
  const [manuale, setManuale] = useState(false);
  const [manualeVal, setManualeVal] = useState({});
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState('');
  const reqId = useRef(nuovoId());

  const cent = parseEuro(importo);
  const valido = cent && !Number.isNaN(cent);
  const auto = useMemo(() => distribuisci(aperti, valido ? cent : 0), [aperti, cent, valido]);
  const attrib = manuale ? manualeVal : auto;

  function cambiaManuale(m) {
    if (m) setManualeVal(auto);
    setManuale(m);
  }

  async function conferma() {
    setErrore('');
    if (!valido) return setErrore('Inserisci un importo valido.');
    if (cent > totaleAperto) return setErrore(`L’importo supera il totale da pagare (${euro(totaleAperto)}).`);
    const righe = Object.entries(attrib).filter(([, v]) => v > 0).map(([lavoro_id, importo_cent]) => ({ lavoro_id, importo_cent }));
    const somma = righe.reduce((a, r) => a + r.importo_cent, 0);
    if (somma !== cent) return setErrore('La ripartizione non corrisponde all’importo.');
    setBusy(true);
    const { error } = await supabase().rpc('registra_pagamento', {
      p_request_id: reqId.current,
      p_conto_id: contoId,
      p_importo_cent: cent,
      p_metodo: metodo,
      p_attribuzioni: righe,
      p_data: dataP,
      p_nota: testo(nota),
    });
    setBusy(false);
    if (error) return setErrore(erroreMsg(error));
    toast(`Pagamento di ${euro(cent)} registrato`);
    refresh();
    onDone?.();
  }

  return (
    <Modal
      title="Registra pagamento"
      onClose={onClose}
      footer={
        <button className="btn btn-primary btn-big" disabled={busy || !aperti.length} onClick={conferma}>
          {busy ? 'Salvataggio…' : `Registra ${valido ? euro(cent) : 'pagamento'}`}
        </button>
      }
    >
      {!aperti.length ? (
        <p className="muted">Non ci sono importi da pagare. Se un lavoro ha il prezzo da definire, confermalo prima dalla sua scheda.</p>
      ) : (
        <div className="stack">
          <div className="riquadro-arancio">
            <span className="small strong">Totale da pagare</span>
            <strong className="num">{euro(totaleAperto)}</strong>
          </div>
          <Campo label="Importo">
            <div className="row gap8">
              <input className="input input-big num" inputMode="decimal" value={importo} onChange={(e) => setImporto(e.target.value)} />
              <button type="button" className="btn btn-outline" onClick={() => setImporto(centToInput(totaleAperto))}>Salda tutto</button>
            </div>
          </Campo>
          <Campo label="Metodo"><Metodo value={metodo} onChange={setMetodo} /></Campo>
          <div className="grid2">
            <Campo label="Data del pagamento">
              <input type="date" className="input" value={dataP} max={oggiISO()} onChange={(e) => setDataP(e.target.value)} />
            </Campo>
            <Campo label="Nota o riferimento">
              <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Facoltativa" />
            </Campo>
          </div>
          <Attribuzioni lavori={aperti} value={attrib} onChange={setManualeVal} totale={valido ? cent : 0} manuale={manuale} setManuale={cambiaManuale} />
          {errore && <div className="errore">{errore}</div>}
        </div>
      )}
    </Modal>
  );
}
