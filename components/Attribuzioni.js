'use client';

import { centToInput, dataBreve, euro, parseEuro, racchettaNome } from '@/lib/format';

// lavori: aperti (residuo > 0), già in ordine dal più vecchio
// value: { [lavoroId]: cent }
export default function Attribuzioni({ lavori, value, onChange, totale, manuale, setManuale }) {
  const somma = Object.values(value).reduce((a, b) => a + (b || 0), 0);
  const diff = (totale || 0) - somma;

  return (
    <div className="attrib">
      <div className="attrib-head">
        <span className="small strong">{manuale ? 'Ripartizione scelta da te' : 'Salda prima i lavori più vecchi'}</span>
        <button type="button" className="link-btn" onClick={() => setManuale(!manuale)}>
          {manuale ? 'Torna automatica' : 'Scegli tu i lavori'}
        </button>
      </div>
      {lavori.map((l) => {
        const v = value[l.id] || 0;
        return (
          <div key={l.id} className="attrib-riga">
            <div className="attrib-desc">
              <span className="small strong">{racchettaNome(l)}</span>
              <span className="small muted">
                {l.codice}, {l.ritirato ? `ritirata ${dataBreve(l.ritirato_at)}` : 'al circolo'}, resta {euro(l.residuo_cent)}
              </span>
            </div>
            {manuale ? (
              <input
                className="input input-sm num"
                inputMode="decimal"
                aria-label={`Importo per ${l.codice}`}
                defaultValue={v ? centToInput(v) : ''}
                placeholder="0,00"
                onChange={(e) => {
                  const c = parseEuro(e.target.value);
                  const nv = { ...value };
                  if (!c || Number.isNaN(c)) delete nv[l.id];
                  else nv[l.id] = c;
                  onChange(nv);
                }}
              />
            ) : (
              <span className="small strong num">
                {v ? (v >= l.residuo_cent ? `${euro(v)}, saldata` : `${euro(v)}, resta ${euro(l.residuo_cent - v)}`) : '—'}
              </span>
            )}
          </div>
        );
      })}
      {diff !== 0 && totale > 0 && (
        <span className="small rosso-t">
          {diff > 0 ? `Mancano ${euro(diff)} da ripartire` : `Hai ripartito ${euro(-diff)} in più dell’importo`}
        </span>
      )}
    </div>
  );
}
