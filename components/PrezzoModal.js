'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { centToInput, erroreMsg, euro, parseEuro, testo } from '@/lib/format';
import { useApp } from './AppProvider';
import { Campo, Modal } from './ui';

export default function PrezzoModal({ lavoro: l, onClose, onDone }) {
  const { toast, refresh } = useApp();
  const [daDefinire, setDaDefinire] = useState(l.prezzo_cent === null);
  const [prezzo, setPrezzo] = useState(centToInput(l.prezzo_cent));
  const [dett, setDett] = useState({
    m: centToInput(l.prezzo_manodopera_cent),
    c: centToInput(l.prezzo_corde_cent),
    e: centToInput(l.prezzo_extra_cent),
    s: centToInput(l.sconto_cent),
  });
  const [motivoGratuito, setMotivoGratuito] = useState(l.motivo_gratuito || '');
  const [nota, setNota] = useState('');
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState('');

  function setD(k, v) {
    const n = { ...dett, [k]: v };
    setDett(n);
    const vals = ['m', 'c', 'e', 's'].map((x) => parseEuro(n[x]));
    if (vals.some((x) => Number.isNaN(x))) return;
    if (vals.slice(0, 3).every((x) => x === null)) return;
    const tot = (vals[0] || 0) + (vals[1] || 0) + (vals[2] || 0) - (vals[3] || 0);
    setPrezzo(centToInput(Math.max(tot, 0)));
  }

  const cent = daDefinire ? null : parseEuro(prezzo);
  const gratuito = cent === 0;

  async function salva() {
    setErrore('');
    if (!daDefinire && (cent === null || Number.isNaN(cent))) return setErrore('Inserisci il prezzo oppure segna "da definire".');
    if (gratuito && !testo(motivoGratuito)) return setErrore('Per un lavoro gratuito indica il motivo.');
    const d = ['m', 'c', 'e', 's'].map((x) => parseEuro(dett[x]));
    if (d.some((x) => Number.isNaN(x))) return setErrore('Controlla gli importi del dettaglio.');
    setBusy(true);
    const { error } = await supabase().rpc('imposta_prezzo', {
      p_lavoro_id: l.id,
      p_prezzo_cent: cent,
      p_motivo_gratuito: gratuito ? testo(motivoGratuito) : null,
      p_nota: testo(nota),
      p_manodopera_cent: daDefinire ? null : d[0],
      p_corde_cent: daDefinire ? null : d[1],
      p_extra_cent: daDefinire ? null : d[2],
      p_sconto_cent: daDefinire ? null : d[3],
    });
    setBusy(false);
    if (error) return setErrore(erroreMsg(error));
    toast(daDefinire ? 'Prezzo segnato da definire' : `Prezzo impostato: ${euro(cent)}`);
    refresh();
    onDone?.();
  }

  return (
    <Modal title={`Prezzo ${l.codice}`} onClose={onClose}
      footer={<button className="btn btn-primary btn-big" disabled={busy} onClick={salva}>{busy ? 'Salvataggio…' : 'Salva prezzo'}</button>}>
      <div className="stack">
        {l.pagato_cent > 0 && <div className="avviso-verde">Già incassati {euro(l.pagato_cent)}: il prezzo non può scendere sotto questa cifra.</div>}
        <label className="check-label">
          <input type="checkbox" checked={daDefinire} onChange={(e) => setDaDefinire(e.target.checked)} disabled={l.pagato_cent > 0} />
          <span>Prezzo ancora da definire</span>
        </label>
        {!daDefinire && (
          <>
            <Campo label="Prezzo totale">
              <input className="input input-big num" inputMode="decimal" value={prezzo} onChange={(e) => setPrezzo(e.target.value)} placeholder="0,00" />
            </Campo>
            <details className="dettagli">
              <summary>Dettaglio del prezzo (facoltativo)</summary>
              <div className="grid2" style={{ marginTop: 10 }}>
                <Campo label="Manodopera"><input className="input num" inputMode="decimal" value={dett.m} onChange={(e) => setD('m', e.target.value)} /></Campo>
                <Campo label="Corde"><input className="input num" inputMode="decimal" value={dett.c} onChange={(e) => setD('c', e.target.value)} /></Campo>
                <Campo label="Extra"><input className="input num" inputMode="decimal" value={dett.e} onChange={(e) => setD('e', e.target.value)} /></Campo>
                <Campo label="Sconto"><input className="input num" inputMode="decimal" value={dett.s} onChange={(e) => setD('s', e.target.value)} /></Campo>
              </div>
            </details>
            {gratuito && (
              <Campo label="Motivo del lavoro gratuito">
                <input className="input" value={motivoGratuito} onChange={(e) => setMotivoGratuito(e.target.value)} placeholder="Es. omaggio, garanzia" />
              </Campo>
            )}
          </>
        )}
        {l.prezzo_cent !== null && (
          <Campo label="Motivo della modifica">
            <input className="input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Facoltativo, resta nello storico" />
          </Campo>
        )}
        {errore && <div className="errore">{errore}</div>}
      </div>
    </Modal>
  );
}
