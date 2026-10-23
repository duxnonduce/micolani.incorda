'use client';

import { numToInput, parseNum, testo } from '@/lib/format';
import { Campo } from './ui';

export const CAMPI_TECNICI = [
  'vert_marca', 'vert_modello', 'vert_calibro', 'oriz_marca', 'oriz_modello', 'oriz_calibro',
  'tensione_vert', 'tensione_oriz', 'prestretch_perc', 'nodi', 'corde_fornite_da', 'note_tecniche',
];
const NUMERICI = ['tensione_vert', 'tensione_oriz', 'prestretch_perc', 'nodi'];

// dal record del database ai valori del modulo (stringhe)
export function tecniciDaLavoro(l) {
  const o = {};
  for (const k of CAMPI_TECNICI) {
    o[k] = NUMERICI.includes(k) ? numToInput(l?.[k]) : l?.[k] ?? '';
  }
  return o;
}

export function tecniciVuoti() {
  return tecniciDaLavoro(null);
}

// dai valori del modulo al database; restituisce { dati, errore }
export function tecniciPerDb(v) {
  const dati = {};
  for (const k of CAMPI_TECNICI) {
    if (NUMERICI.includes(k)) {
      const n = parseNum(v[k]);
      if (Number.isNaN(n)) return { errore: 'Controlla tensioni, prestretch e nodi: devono essere numeri.' };
      dati[k] = n;
    } else {
      dati[k] = testo(v[k]);
    }
  }
  for (const k of ['tensione_vert', 'tensione_oriz']) {
    if (dati[k] !== null && (dati[k] < 5 || dati[k] > 40)) return { errore: 'La tensione deve essere tra 5 e 40 kg.' };
  }
  if (dati.nodi !== null && (!Number.isInteger(dati.nodi) || dati.nodi < 1 || dati.nodi > 6)) return { errore: 'Nodi: da 1 a 6.' };
  if (dati.prestretch_perc !== null && (dati.prestretch_perc < 0 || dati.prestretch_perc > 50)) return { errore: 'Prestretch: da 0 a 50%.' };
  return { dati };
}

export default function DatiTecnici({ value, onChange, disabled }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  const copia = () =>
    onChange({ ...value, oriz_marca: value.vert_marca, oriz_modello: value.vert_modello, oriz_calibro: value.vert_calibro });

  return (
    <fieldset className="stack fieldset" disabled={disabled}>
      <div className="sotto-tit">Verticali</div>
      <div className="grid3">
        <Campo label="Marca"><input className="input" value={value.vert_marca} onChange={set('vert_marca')} /></Campo>
        <Campo label="Modello"><input className="input" value={value.vert_modello} onChange={set('vert_modello')} /></Campo>
        <Campo label="Calibro"><input className="input" value={value.vert_calibro} onChange={set('vert_calibro')} placeholder="1.25" /></Campo>
      </div>
      <div className="row between">
        <div className="sotto-tit">Orizzontali</div>
        <button type="button" className="link-btn" onClick={copia}>Uguali alle verticali</button>
      </div>
      <div className="grid3">
        <Campo label="Marca"><input className="input" value={value.oriz_marca} onChange={set('oriz_marca')} /></Campo>
        <Campo label="Modello"><input className="input" value={value.oriz_modello} onChange={set('oriz_modello')} /></Campo>
        <Campo label="Calibro"><input className="input" value={value.oriz_calibro} onChange={set('oriz_calibro')} /></Campo>
      </div>
      <div className="grid2">
        <Campo label="Tensione verticali (kg)"><input className="input input-big num" inputMode="decimal" value={value.tensione_vert} onChange={set('tensione_vert')} /></Campo>
        <Campo label="Tensione orizzontali (kg)"><input className="input input-big num" inputMode="decimal" value={value.tensione_oriz} onChange={set('tensione_oriz')} /></Campo>
      </div>
      <div className="grid3">
        <Campo label="Prestretch %"><input className="input" inputMode="decimal" value={value.prestretch_perc} onChange={set('prestretch_perc')} placeholder="Nessuno" /></Campo>
        <Campo label="Nodi"><input className="input" inputMode="numeric" value={value.nodi} onChange={set('nodi')} placeholder="—" /></Campo>
        <Campo label="Corde fornite da">
          <select className="input" value={value.corde_fornite_da} onChange={set('corde_fornite_da')}>
            <option value="">—</option>
            <option value="circolo">Circolo</option>
            <option value="cliente">Cliente</option>
          </select>
        </Campo>
      </div>
      <Campo label="Note tecniche per l’incordatore">
        <textarea className="input" rows={2} value={value.note_tecniche} onChange={set('note_tecniche')} />
      </Campo>
    </fieldset>
  );
}
