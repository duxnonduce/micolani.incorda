'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { consegna, dataBreve, euro, nomeCliente, racchettaNome } from '@/lib/format';

const LAV = {
  attesa: ['In attesa', 'chip-grigio'],
  lavorazione: ['In lavorazione', 'chip-blu'],
  pronta: ['Pronta', 'chip-verde'],
  annullata: ['Annullata', 'chip-rosso'],
};

const PAG = {
  da_pagare: ['Da pagare', 'chip-arancio'],
  parziale: ['Parziale', 'chip-arancio'],
  pagata: ['Pagata', 'chip-verde-pieno'],
  da_definire: ['Prezzo da definire', 'chip-giallo'],
  omaggio: ['Omaggio', 'chip-grigio'],
  da_rimborsare: ['Da rimborsare', 'chip-rosso'],
};

export function Chips({ l }) {
  const [lt, lc] = LAV[l.stato_lavoro] || ['?', 'chip-grigio'];
  const p = PAG[l.stato_pagamento];
  return (
    <div className="chips">
      <span className={'chip ' + lc}>{lt}</span>
      {l.stato_lavoro !== 'annullata' || l.ritirato ? (
        <span className={'chip ' + (l.ritirato ? 'chip-scuro' : 'chip-grigio')}>
          {l.ritirato ? 'Ritirata ' + dataBreve(l.ritirato_at) : 'Al circolo'}
        </span>
      ) : null}
      {p && (
        <span className={'chip ' + p[1]}>
          {p[0]}
          {l.stato_pagamento === 'parziale' ? ` · ${euro(l.pagato_cent)} su ${euro(l.prezzo_cent)}` : ''}
        </span>
      )}
    </div>
  );
}

export function Importo({ l }) {
  if (l.stato_lavoro === 'annullata') return <span className="muted">—</span>;
  if (l.prezzo_cent === null) return <span className="giallo-t">da definire</span>;
  if (l.residuo_cent > 0 && l.pagato_cent > 0) return <span className="arancio-t">resta {euro(l.residuo_cent)}</span>;
  if (l.residuo_cent > 0) return <span className="arancio-t">{euro(l.prezzo_cent)}</span>;
  return <span className="muted">{euro(l.prezzo_cent)}</span>;
}

export function LavoroRiga({ l, conCliente = true }) {
  const ritardo = ['attesa', 'lavorazione'].includes(l.stato_lavoro) && l.consegna_prevista && new Date(l.consegna_prevista) < new Date();
  return (
    <Link href={`/lavori/${l.id}`} className="riga">
      <div className="riga-top">
        <div className="riga-tit">
          <strong>{conCliente ? nomeCliente(l) : racchettaNome(l)}</strong>
          <span className="muted small">
            {l.codice}
            {conCliente ? `, ${racchettaNome(l)}` : ''}
          </span>
        </div>
        <strong className="num"><Importo l={l} /></strong>
      </div>
      <Chips l={l} />
      {(l.priorita === 'urgente' || (l.consegna_prevista && !l.ritirato && ['attesa', 'lavorazione'].includes(l.stato_lavoro))) && (
        <span className={'small ' + (ritardo ? 'rosso-t' : 'muted')}>
          {l.priorita === 'urgente' ? 'Urgente. ' : ''}
          {l.consegna_prevista && !l.ritirato && ['attesa', 'lavorazione'].includes(l.stato_lavoro) ? `Consegna ${consegna(l.consegna_prevista)}` : ''}
        </span>
      )}
    </Link>
  );
}

export function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2 className="h2">{title}</h2>
          <button className="icon-btn" aria-label="Chiudi" onClick={onClose}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Campo({ label, children, nota }) {
  return (
    <label className="campo">
      <span className="campo-l">{label}</span>
      {children}
      {nota && <span className="small muted">{nota}</span>}
    </label>
  );
}

export function Metodo({ value, onChange }) {
  const m = [['contanti', 'Contanti'], ['pos', 'POS'], ['bonifico', 'Bonifico'], ['altro', 'Altro']];
  return (
    <div className="segmenti" role="radiogroup" aria-label="Metodo di pagamento">
      {m.map(([k, t]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k}
          className={'seg' + (value === k ? ' on' : '')} onClick={() => onChange(k)}>{t}</button>
      ))}
    </div>
  );
}

export function Vuoto({ children }) {
  return <div className="vuoto">{children}</div>;
}

export function Caricamento() {
  return <div className="centro-blocco"><div className="spinner" aria-label="Caricamento" /></div>;
}
