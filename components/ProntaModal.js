'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { centToInput, cordeTesto, erroreMsg, euro, parseEuro } from '@/lib/format';
import { useApp } from './AppProvider';
import { Campo, Modal } from './ui';

export default function ProntaModal({ lavoro: l, onClose, onDone }) {
  const { toast, refresh } = useApp();
  const [prezzo, setPrezzo] = useState(centToInput(l.prezzo_cent));
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState('');

  const cent = parseEuro(prezzo);
  const valido = cent !== null && !Number.isNaN(cent);

  async function conferma() {
    setErrore('');
    if (!valido) return setErrore('Scrivi il prezzo (0 se è gratis).');
    setBusy(true);
    const { error } = await supabase().rpc('segna_pronta', { p_lavoro_id: l.id, p_prezzo_cent: cent });
    setBusy(false);
    if (error) return setErrore(erroreMsg(error));
    toast(`${l.cliente_nome} ${l.cliente_cognome}: pronta, ${euro(cent)}`, 'pronta');
    refresh();
    onDone?.();
  }

  const racchetta = [l.racchetta_marca, l.racchetta_modello].filter(Boolean).join(' ') || 'Racchetta';

  return (
    <Modal title="Segna come pronta" onClose={onClose}
      footer={
        <button className="btn btn-primary btn-big" disabled={busy || !valido} onClick={conferma}>
          {busy ? 'Salvataggio…' : valido ? `Conferma pronta, ${euro(cent)}` : 'Conferma pronta'}
        </button>
      }>
      <div className="stack">
        <div className="stack-0">
          <strong style={{ fontSize: 18 }}>{l.cliente_nome} {l.cliente_cognome}</strong>
          <span>{racchetta}</span>
          {cordeTesto(l) && <span className="muted small">{cordeTesto(l)}</span>}
        </div>
        <Campo label="Prezzo (€)">
          <input className="input input-big num" inputMode="decimal" autoFocus value={prezzo}
            placeholder="0,00" onChange={(e) => setPrezzo(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') conferma(); }} />
        </Campo>
        {l.pagato_cent > 0 && <span className="small muted">Già pagati {euro(l.pagato_cent)}.</span>}
        {errore && <div className="errore">{errore}</div>}
      </div>
    </Modal>
  );
}
