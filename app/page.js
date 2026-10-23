'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/Shell';
import { useApp } from '@/components/AppProvider';
import { Caricamento } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { consegna, dataOra, erroreMsg, euro, giorniDa, nomeCliente, racchettaNome } from '@/lib/format';

export default function Riepilogo() {
  const { session, profilo, has, tick, nomeOperatore, toast } = useApp();
  const router = useRouter();
  const [d, setD] = useState(null);

  const soloIncordatore = profilo && !has('segreteria') && has('incordatore');

  useEffect(() => {
    if (soloIncordatore) router.replace('/coda');
  }, [soloIncordatore, router]);

  useEffect(() => {
    if (!session || !profilo || !has('segreteria')) return;
    (async () => {
      const sb = supabase();
      const { data: imp } = await sb.from('impostazioni').select('valore').eq('chiave', 'soglie_avvisi').maybeSingle();
      const soglie = { pronta_da_giorni: 7, ritirata_non_pagata_giorni: 7, ...(imp?.valore || {}) };
      const limitePronta = new Date(Date.now() - soglie.pronta_da_giorni * 86400000).toISOString();
      const limiteDebito = new Date(Date.now() - soglie.ritirata_non_pagata_giorni * 86400000).toISOString();
      const ora = new Date().toISOString();

      const [r, pronte, ritardi, vecchie, debiti, nDeb] = await Promise.all([
        sb.from('v_riepilogo').select('*').maybeSingle(),
        sb.from('v_lavori').select('*').eq('stato_lavoro', 'pronta').eq('ritirato', false)
          .gte('pronta_at', limitePronta).order('pronta_at', { ascending: false }).limit(6),
        sb.from('v_lavori').select('*').in('stato_lavoro', ['attesa', 'lavorazione']).lt('consegna_prevista', ora)
          .order('consegna_prevista').limit(10),
        sb.from('v_lavori').select('*').eq('stato_lavoro', 'pronta').eq('ritirato', false)
          .lt('pronta_at', limitePronta).order('pronta_at').limit(10),
        sb.from('v_saldi_clienti').select('*').lt('primo_ritiro_non_saldato', limiteDebito)
          .order('primo_ritiro_non_saldato').limit(10),
        sb.from('v_saldi_clienti').select('cliente_id', { count: 'exact', head: true }).gt('residuo_ritirate_cent', 0),
      ]);
      const err = [r, pronte, ritardi, vecchie, debiti].find((x) => x.error);
      if (err) return toast(erroreMsg(err.error), 'errore');
      setD({
        r: r.data, pronte: pronte.data, ritardi: ritardi.data, vecchie: vecchie.data, debiti: debiti.data,
        clientiDebito: nDeb.count || 0, soglie,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, profilo, tick]);

  return (
    <Shell title="Riepilogo" ruolo="segreteria">
      <form className="cerca" onSubmit={(e) => { e.preventDefault(); const q = e.currentTarget.q.value.trim(); router.push('/clienti' + (q ? `?q=${encodeURIComponent(q)}` : '')); }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
        <input name="q" placeholder="Cerca cliente, telefono o codice" aria-label="Cerca cliente" enterKeyHint="search" />
      </form>

      {!d ? <Caricamento /> : (
        <>
          <Link href="/clienti?debiti=1" className="box-debito">
            <span className="small strong">Da riscuotere su racchette già ritirate</span>
            <div className="row between wrap gap8">
              <span className="grande num">{euro(d.r.da_riscuotere_ritirate_cent)}</span>
              <span className="small strong">
                {d.r.ritirate_con_saldo_aperto} racchette, {d.clientiDebito} {d.clientiDebito === 1 ? 'cliente' : 'clienti'}
              </span>
            </div>
            <span className="small strong" style={{ textDecoration: 'underline' }}>Vedi chi deve pagare</span>
          </Link>

          <div className="contatori">
            <Link href="/lavori?stato=attesa" className="contatore"><span>In attesa</span><strong>{d.r.in_attesa}</strong></Link>
            <Link href="/lavori?stato=lavorazione" className="contatore"><span>In lavorazione</span><strong style={{ color: 'var(--blu)' }}>{d.r.in_lavorazione}</strong></Link>
            <Link href="/lavori?stato=pronta&ritiro=no" className="contatore"><span>Pronte da ritirare</span><strong style={{ color: 'var(--verde)' }}>{d.r.pronte_da_ritirare}</strong></Link>
            <div className="contatore"><span>Incassi di oggi</span><strong className="num">{euro(d.r.incassi_oggi_cent)}</strong></div>
          </div>

          <section className="card" style={{ gap: 0, paddingTop: 10, paddingBottom: 6 }}>
            <h2 className="h2" style={{ marginBottom: 4 }}>Avvisi</h2>
            {d.r.urgenti > 0 && (
              <Link href="/lavori?urgenti=1" className="avviso">
                <span className="pallino" style={{ background: 'var(--rosso)' }} />
                <span className="stack-0"><strong>{d.r.urgenti} {d.r.urgenti === 1 ? 'lavoro urgente' : 'lavori urgenti'} in coda</strong></span>
              </Link>
            )}
            {d.pronte.map((l) => (
              <Link key={l.id} href={`/lavori/${l.id}`} className="avviso">
                <span className="pallino" style={{ background: 'var(--verde)' }} />
                <span className="stack-0">
                  <strong>Pronta: {nomeCliente(l)}</strong>
                  <span className="small muted">{l.codice}, {racchettaNome(l)}, da {nomeOperatore(l.pronta_by)} il {dataOra(l.pronta_at)}</span>
                </span>
              </Link>
            ))}
            {d.ritardi.map((l) => (
              <Link key={l.id} href={`/lavori/${l.id}`} className="avviso">
                <span className="pallino" style={{ background: 'var(--rosso)' }} />
                <span className="stack-0">
                  <strong>Consegna superata: {nomeCliente(l)}</strong>
                  <span className="small muted">{l.codice}, prevista {consegna(l.consegna_prevista)}{l.priorita === 'urgente' ? ', urgente' : ''}</span>
                </span>
              </Link>
            ))}
            {d.vecchie.map((l) => (
              <Link key={l.id} href={`/lavori/${l.id}`} className="avviso">
                <span className="pallino" style={{ background: 'var(--muted)' }} />
                <span className="stack-0">
                  <strong>Pronta da {giorniDa(l.pronta_at)} giorni: {nomeCliente(l)}</strong>
                  <span className="small muted">{l.codice}, {racchettaNome(l)}</span>
                </span>
              </Link>
            ))}
            {d.debiti.map((c) => (
              <Link key={c.cliente_id} href={`/clienti/${c.cliente_id}`} className="avviso">
                <span className="pallino" style={{ background: '#C2581B' }} />
                <span className="stack-0">
                  <strong>Non paga da {giorniDa(c.primo_ritiro_non_saldato)} giorni: {c.cognome} {c.nome}</strong>
                  <span className="small muted">{euro(c.residuo_ritirate_cent)} su racchette già ritirate</span>
                </span>
              </Link>
            ))}
            {!d.r.urgenti && !d.pronte.length && !d.ritardi.length && !d.vecchie.length && !d.debiti.length && (
              <p className="muted" style={{ padding: '10px 0' }}>Nessun avviso.</p>
            )}
          </section>
        </>
      )}
    </Shell>
  );
}
