'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { useApp } from '@/components/AppProvider';
import { Caricamento, Vuoto } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { consegna, corda, erroreMsg, nomeCliente, numToInput, racchettaNome } from '@/lib/format';

function ordina(a, b) {
  if (a.priorita !== b.priorita) return a.priorita === 'urgente' ? -1 : 1;
  const ca = a.consegna_prevista ? new Date(a.consegna_prevista).getTime() : Infinity;
  const cb = b.consegna_prevista ? new Date(b.consegna_prevista).getTime() : Infinity;
  if (ca !== cb) return ca - cb;
  return new Date(a.consegnata_at) - new Date(b.consegnata_at);
}

export default function Coda() {
  const { session, profilo, tick, toast, refresh } = useApp();
  const [lavori, setLavori] = useState(null);
  const [filtro, setFiltro] = useState('tutte');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (!session || !profilo) return;
    supabase().from('v_lavori').select('*').in('stato_lavoro', ['attesa', 'lavorazione']).limit(500)
      .then(({ data, error }) => {
        if (error) return toast(erroreMsg(error), 'errore');
        setLavori((data || []).sort(ordina));
      });
  }, [session, profilo, tick, toast]);

  async function stato(l, nuovo) {
    setBusy(l.id);
    const { error } = await supabase().rpc('cambia_stato_lavoro', { p_lavoro_id: l.id, p_stato: nuovo });
    setBusy(null);
    if (error) return toast(erroreMsg(error), 'errore');
    toast(nuovo === 'pronta' ? `${l.codice} pronta: la segreteria è avvisata` : `${l.codice} in lavorazione`);
    refresh();
  }

  const lista = (lavori || []).filter((l) =>
    filtro === 'mie' ? l.incordatore_id === profilo?.id : filtro === 'urgenti' ? l.priorita === 'urgente' : true
  );
  const incompleto = (l) => l.tensione_vert === null || l.tensione_oriz === null || !(l.vert_marca || l.vert_modello) || !(l.oriz_marca || l.oriz_modello);

  return (
    <Shell title="Da incordare" ruolo="incordatore">
      <div className="filtri" role="group" aria-label="Filtro coda">
        {[['tutte', `Tutte${lavori ? ` (${lavori.length})` : ''}`], ['mie', 'Le mie'], ['urgenti', 'Urgenti']].map(([k, t]) => (
          <button key={k} className={'pill' + (filtro === k ? ' on' : '')} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{t}</button>
        ))}
      </div>

      {!lavori ? <Caricamento /> : !lista.length ? <Vuoto>Nessuna racchetta da incordare.</Vuoto> : lista.map((l) => {
        const ritardo = l.consegna_prevista && new Date(l.consegna_prevista) < new Date();
        const manca = incompleto(l);
        return (
          <article key={l.id} className={'lavoro-card' + (l.priorita === 'urgente' || ritardo ? ' urgente' : '')}>
            <Link href={`/lavori/${l.id}`} className="riga-top" style={{ textDecoration: 'none', color: 'inherit', fontWeight: 400 }}>
              <div className="riga-tit">
                <strong style={{ fontSize: 17 }}>{nomeCliente(l)}</strong>
                <span className="small muted">{racchettaNome(l)}, {l.codice}</span>
              </div>
              {l.priorita === 'urgente' ? <span className="badge-urgente">Urgente</span>
                : l.stato_lavoro === 'lavorazione' ? <span className="chip chip-blu">In lavorazione</span>
                : <span className="chip chip-grigio">In attesa</span>}
            </Link>

            {manca ? (
              <div className="avviso-arancio">Dati tecnici incompleti: <Link href={`/lavori/${l.id}`}>completali</Link> prima di iniziare.</div>
            ) : (
              <div className="corde">
                <div className="stack-0">
                  <span className="t">Verticali</span>
                  <strong>{corda(l.vert_marca, l.vert_modello, l.vert_calibro)}</strong>
                  <span className="kg num">{numToInput(l.tensione_vert)} kg</span>
                </div>
                <div className="stack-0">
                  <span className="t">Orizzontali</span>
                  <strong>{corda(l.oriz_marca, l.oriz_modello, l.oriz_calibro)}</strong>
                  <span className="kg num">{numToInput(l.tensione_oriz)} kg</span>
                </div>
              </div>
            )}

            {(l.prestretch_perc || l.nodi || l.corde_fornite_da || l.note_tecniche || l.posizione) && (
              <span className="small">
                {[
                  l.prestretch_perc ? `Prestretch ${numToInput(l.prestretch_perc)}%` : null,
                  l.nodi ? `${l.nodi} nodi` : null,
                  l.corde_fornite_da === 'cliente' ? 'Corde del cliente' : l.corde_fornite_da === 'circolo' ? 'Corde del circolo' : null,
                  l.posizione ? `Posizione: ${l.posizione}` : null,
                ].filter(Boolean).join('. ')}
                {l.note_tecniche ? <><br /><strong>Nota: </strong>{l.note_tecniche}</> : null}
              </span>
            )}

            <div className="row between gap8 wrap">
              <span className={'small ' + (ritardo ? 'rosso-t' : 'muted')}>
                {ritardo ? 'Consegna superata: ' : 'Consegna '}{consegna(l.consegna_prevista)}
              </span>
              <div className="row gap8">
                {l.stato_lavoro === 'attesa' && (
                  <button className="btn btn-outline" disabled={manca || busy === l.id} onClick={() => stato(l, 'lavorazione')}>Inizia</button>
                )}
                <button className="btn btn-primary" disabled={manca || busy === l.id} onClick={() => stato(l, 'pronta')}>Segna pronta</button>
              </div>
            </div>
          </article>
        );
      })}
    </Shell>
  );
}
