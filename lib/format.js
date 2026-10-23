const TZ = 'Europe/Rome';

export function euro(cent) {
  if (cent === null || cent === undefined) return '—';
  return (cent / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

// "20" -> 2000, "20,5" -> 2050, "1.200,50" -> 120050. Vuoto -> null. Non valido -> NaN
export function parseEuro(s) {
  if (s === null || s === undefined) return null;
  let t = String(s).replace(/[€\s]/g, '');
  if (!t) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

export function centToInput(cent) {
  if (cent === null || cent === undefined) return '';
  return (cent / 100).toFixed(2).replace('.', ',');
}

export function parseNum(s) {
  if (s === null || s === undefined || String(s).trim() === '') return null;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

export function numToInput(n) {
  return n === null || n === undefined ? '' : String(n).replace('.', ',');
}

export function dataOra(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('it-IT', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function dataBreve(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT', { timeZone: TZ, day: 'numeric', month: 'numeric' });
}

export function data(d) {
  if (!d) return '—';
  const x = typeof d === 'string' && d.length === 10 ? new Date(d + 'T12:00:00Z') : new Date(d);
  return x.toLocaleDateString('it-IT', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
}

const giornoISO = (ms) => new Date(ms).toLocaleDateString('sv-SE', { timeZone: TZ });

export function consegna(d) {
  if (!d) return 'nessuna data';
  const x = new Date(d);
  const giorno = giornoISO(x.getTime());
  const ora = x.toLocaleTimeString('it-IT', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const conOra = ora === '00:00' ? '' : ' ' + ora;
  if (giorno === giornoISO(Date.now())) return 'oggi' + conOra;
  if (giorno === giornoISO(Date.now() + 86400000)) return 'domani' + conOra;
  if (giorno === giornoISO(Date.now() - 86400000)) return 'ieri' + conOra;
  return x.toLocaleDateString('it-IT', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }) + conOra;
}

export function giorniDa(d) {
  if (!d) return 0;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

export function oggiISO() {
  return giornoISO(Date.now());
}

export function toLocalInput(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', 'T').slice(0, 16);
}

export function fromLocalInput(s) {
  return s ? new Date(s).toISOString() : null;
}

export function nuovoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function erroreMsg(e) {
  const m = e?.message || String(e || 'Errore sconosciuto');
  if (/Failed to fetch|NetworkError|network|Load failed/i.test(m)) {
    return 'Connessione assente: l’operazione non è stata salvata. Riprova.';
  }
  if (/JWT/i.test(m)) return 'Sessione scaduta: esci e rientra.';
  return m;
}

export function testo(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

export function racchettaNome(l) {
  const m = [l.racchetta_marca, l.racchetta_modello].filter(Boolean).join(' ');
  const parti = [m, l.racchetta_identificazione].filter(Boolean);
  return parti.length ? parti.join(', ') : 'Racchetta';
}

export function corda(marca, modello, calibro) {
  return [marca, modello, calibro].filter(Boolean).join(' ') || 'Corda da indicare';
}

export function nomeCliente(l) {
  return `${l.cliente_cognome} ${l.cliente_nome}`;
}

// Prima parola filtrata sul server, le altre qui
export function paroleRicerca(q) {
  return String(q || '').toLowerCase().replace(/[,()*%"']/g, ' ').split(/\s+/).filter(Boolean);
}

export function corrisponde(parole, campi) {
  const t = campi.filter(Boolean).join(' ').toLowerCase();
  return parole.every((p) => t.includes(p));
}

export function scaricaCSV(nome, colonne, righe) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const out = [colonne.map((c) => esc(c.label)).join(';')]
    .concat(righe.map((r) => colonne.map((c) => esc(c.get(r))).join(';')))
    .join('\n');
  const blob = new Blob(['\ufeff' + out], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const centCSV = (c) => (c === null || c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','));

// Ripartisce un importo sui lavori nell'ordine dato (più vecchi prima)
export function distribuisci(lavori, totale) {
  const out = {};
  let resto = totale || 0;
  for (const l of lavori) {
    if (resto <= 0) break;
    const r = l.residuo_cent || 0;
    if (r <= 0) continue;
    const q = Math.min(r, resto);
    out[l.id] = q;
    resto -= q;
  }
  return out;
}

// Corde e tensione in una riga: "RPM Blast, 24 kg" (o "RPM / Xcel, 24 / 23 kg")
export function cordeTesto(l) {
  const v = [l.vert_marca, l.vert_modello, l.vert_calibro].filter(Boolean).join(' ');
  const o = [l.oriz_marca, l.oriz_modello, l.oriz_calibro].filter(Boolean).join(' ');
  const corde = !o || o === v ? v : v ? `${v} / ${o}` : o;
  const tv = l.tensione_vert;
  const to = l.tensione_oriz;
  let kg = '';
  if (tv !== null && tv !== undefined) kg = to === null || to === undefined || Number(to) === Number(tv) ? `${numToInput(tv)} kg` : `${numToInput(tv)} / ${numToInput(to)} kg`;
  else if (to !== null && to !== undefined) kg = `${numToInput(to)} kg`;
  return [corde, kg].filter(Boolean).join(', ');
}
