'use client';

import { useEffect, useState } from 'react';
import { useApp } from './AppProvider';
import { Campo, Modal } from './ui';
import { supabase } from '@/lib/supabase';
import { erroreMsg, testo } from '@/lib/format';

export default function NuovoClienteModal({ onClose, onCreato, iniziale = '' }) {
  const { toast } = useApp();
  const parti = iniziale.trim().split(/\s+/);
  const [c, setC] = useState({ cognome: parti[0] || '', nome: parti.slice(1).join(' '), telefono: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState('');
  const [omonimi, setOmonimi] = useState([]);

  useEffect(() => {
    if (!testo(c.cognome) || !testo(c.nome)) return setOmonimi([]);
    const t = setTimeout(() => {
      supabase().from('clienti').select('id, codice, nome, cognome, telefono')
        .ilike('cognome', c.cognome.trim()).ilike('nome', c.nome.trim()).limit(5)
        .then(({ data: d }) => setOmonimi(d || []));
    }, 300);
    return () => clearTimeout(t);
  }, [c.nome, c.cognome]);

  async function salva() {
    setErrore('');
    if (!testo(c.nome) || !testo(c.cognome)) return setErrore('Nome e cognome sono obbligatori.');
    setBusy(true);
    const { data: nuovo, error } = await supabase().from('clienti')
      .insert({ nome: c.nome.trim(), cognome: c.cognome.trim(), telefono: testo(c.telefono), note: testo(c.note) })
      .select().single();
    setBusy(false);
    if (error) return setErrore(erroreMsg(error));
    toast(`Cliente ${nuovo.cognome} ${nuovo.nome} creato (${nuovo.codice})`);
    onCreato(nuovo);
  }

  return (
    <Modal title="Nuovo cliente" onClose={onClose}
      footer={<button className="btn btn-primary btn-big" disabled={busy} onClick={salva}>{busy ? 'Salvataggio…' : 'Crea cliente'}</button>}>
      <div className="stack">
        <div className="grid2">
          <Campo label="Cognome"><input className="input" value={c.cognome} onChange={(e) => setC({ ...c, cognome: e.target.value })} autoFocus /></Campo>
          <Campo label="Nome"><input className="input" value={c.nome} onChange={(e) => setC({ ...c, nome: e.target.value })} /></Campo>
        </div>
        <Campo label="Telefono" nota="Facoltativo, aiuta a distinguere gli omonimi">
          <input className="input" type="tel" value={c.telefono} onChange={(e) => setC({ ...c, telefono: e.target.value })} />
        </Campo>
        <Campo label="Note interne"><input className="input" value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} placeholder="Facoltative" /></Campo>
        {omonimi.length > 0 && (
          <div className="avviso-arancio">
            Esiste già un cliente con questo nome. Se è la stessa persona, usa la sua scheda:
            <div className="stack-0" style={{ marginTop: 6 }}>
              {omonimi.map((o) => (
                <button key={o.id} type="button" className="link-btn" style={{ textAlign: 'left' }} onClick={() => onCreato(o)}>
                  {o.cognome} {o.nome}, {o.codice}{o.telefono ? `, tel. ${o.telefono}` : ''}
                </button>
              ))}
            </div>
          </div>
        )}
        {errore && <div className="errore">{errore}</div>}
      </div>
    </Modal>
  );
}

