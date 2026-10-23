'use client';

import { useEffect, useState } from 'react';
import Shell from '@/components/Shell';
import { useApp } from '@/components/AppProvider';
import { Caricamento, Campo } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { erroreMsg } from '@/lib/format';

const RUOLI = [['segreteria', 'Segreteria'], ['incordatore', 'Incordatore'], ['admin', 'Amministratore']];

export default function Impostazioni() {
  const { session, profilo, operatori, toast, refresh } = useApp();
  const [soglie, setSoglie] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!session || !profilo) return;
    supabase().from('impostazioni').select('valore').eq('chiave', 'soglie_avvisi').maybeSingle()
      .then(({ data }) => setSoglie({ pronta_da_giorni: 7, ritirata_non_pagata_giorni: 7, ...(data?.valore || {}) }));
  }, [session, profilo]);

  async function salvaSoglie() {
    const v = {
      pronta_da_giorni: Math.max(1, parseInt(soglie.pronta_da_giorni, 10) || 7),
      ritirata_non_pagata_giorni: Math.max(1, parseInt(soglie.ritirata_non_pagata_giorni, 10) || 7),
    };
    setBusy(true);
    const { error } = await supabase().from('impostazioni').upsert({ chiave: 'soglie_avvisi', valore: v, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) return toast(erroreMsg(error), 'errore');
    toast('Soglie salvate');
  }

  async function aggiornaOperatore(o, patch) {
    const { error } = await supabase().from('profili').update(patch).eq('id', o.id);
    if (error) return toast(erroreMsg(error), 'errore');
    toast('Operatore aggiornato');
    refresh();
  }

  function toggleRuolo(o, r) {
    const ruoli = o.ruoli.includes(r) ? o.ruoli.filter((x) => x !== r) : [...o.ruoli, r];
    aggiornaOperatore(o, { ruoli });
  }

  return (
    <Shell title="Impostazioni" back="/" ruolo="admin">
      <section className="card">
        <h2 className="h2">Soglie degli avvisi</h2>
        {!soglie ? <Caricamento /> : (
          <>
            <div className="grid2">
              <Campo label="Pronta e non ritirata da (giorni)">
                <input className="input" inputMode="numeric" value={soglie.pronta_da_giorni} onChange={(e) => setSoglie({ ...soglie, pronta_da_giorni: e.target.value })} />
              </Campo>
              <Campo label="Ritirata e non pagata da (giorni)">
                <input className="input" inputMode="numeric" value={soglie.ritirata_non_pagata_giorni} onChange={(e) => setSoglie({ ...soglie, ritirata_non_pagata_giorni: e.target.value })} />
              </Campo>
            </div>
            <button className="btn btn-primary" disabled={busy} onClick={salvaSoglie}>Salva soglie</button>
          </>
        )}
      </section>

      <section className="card" style={{ gap: 0 }}>
        <h2 className="h2">Operatori</h2>
        <p className="small muted" style={{ margin: '4px 0 8px' }}>
          I nuovi account si creano su Supabase, in Authentication. Poi compaiono qui e puoi assegnare i ruoli.
        </p>
        {operatori.map((o) => {
          const io = o.id === profilo?.id;
          return (
            <div key={o.id} className="evento" style={{ gap: 8 }}>
              <div className="row between gap8 wrap">
                <div className="stack-0">
                  <strong>{[o.nome, o.cognome].filter(Boolean).join(' ') || 'Senza nome'}{io ? ' (tu)' : ''}</strong>
                  <span className="small muted">{o.email}</span>
                </div>
                {!io && (
                  <button className={'btn btn-sm ' + (o.attivo ? 'btn-ghost' : 'btn-outline')} onClick={() => aggiornaOperatore(o, { attivo: !o.attivo })}>
                    {o.attivo ? 'Disattiva' : 'Riattiva'}
                  </button>
                )}
              </div>
              <div className="segmenti">
                {RUOLI.map(([r, t]) => (
                  <button key={r} type="button" className={'seg' + (o.ruoli.includes(r) ? ' on' : '')} aria-pressed={o.ruoli.includes(r)}
                    disabled={io && r === 'admin'} onClick={() => toggleRuolo(o, r)}>{t}</button>
                ))}
              </div>
              {!o.attivo && <span className="small rosso-t">Disattivato: non può accedere ai dati.</span>}
            </div>
          );
        })}
      </section>
    </Shell>
  );
}
