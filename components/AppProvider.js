'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

const Ctx = createContext(null);

export function useApp() {
  return useContext(Ctx);
}

export function AppProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = caricamento
  const [profilo, setProfilo] = useState(null);
  const [operatori, setOperatori] = useState([]);
  const [tick, setTick] = useState(0);
  const [toasts, setToasts] = useState([]);
  const [online, setOnline] = useState(true);
  const debounce = useRef(null);

  const toast = useCallback((msg, tipo = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, tipo }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tipo === 'errore' ? 7000 : 4500);
  }, []);

  const refresh = useCallback(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setTick((t) => t + 1), 250);
  }, []);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s || null));
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    setOnline(navigator.onLine);
    return () => {
      sub.subscription.unsubscribe();
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    if (!userId) {
      setProfilo(null);
      setOperatori([]);
      return;
    }
    const sb = supabase();
    sb.from('profili').select('*').eq('id', userId).maybeSingle()
      .then(({ data }) => setProfilo(data || { id: userId, ruoli: [], attivo: false }));
    sb.from('profili').select('id, nome, cognome, email, ruoli, attivo').order('nome')
      .then(({ data }) => setOperatori(data || []));
  }, [userId, tick]);

  const ruoli = profilo?.attivo ? profilo.ruoli || [] : [];
  const has = useCallback(
    (r) => ruoli.includes('admin') || ruoli.includes(r),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ruoli.join(',')]
  );
  const abilitato = ruoli.length > 0;

  // Aggiornamenti in tempo reale
  useEffect(() => {
    if (!userId || !abilitato) return;
    const sb = supabase();
    const ch = sb
      .channel('incorda-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lavori' }, async (p) => {
        refresh();
        const n = p.new;
        if (
          p.eventType === 'UPDATE' && n?.stato_lavoro === 'pronta' && n?.pronta_at &&
          Date.now() - new Date(n.pronta_at).getTime() < 20000 && n.pronta_by !== userId &&
          (ruoli.includes('segreteria') || ruoli.includes('admin'))
        ) {
          const { data } = await sb.from('v_lavori').select('codice, cliente_nome, cliente_cognome').eq('id', n.id).maybeSingle();
          if (data) toast(`Pronta: ${data.cliente_cognome} ${data.cliente_nome} (${data.codice})`, 'pronta');
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pagamenti' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clienti' }, refresh)
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, abilitato]);

  const nomeOperatore = useCallback(
    (id) => {
      if (!id) return '—';
      const o = operatori.find((x) => x.id === id);
      return o ? [o.nome, o.cognome].filter(Boolean).join(' ') || o.email : 'Operatore';
    },
    [operatori]
  );

  const value = useMemo(
    () => ({ session, profilo, operatori, has, abilitato, tick, refresh, toast, nomeOperatore, online }),
    [session, profilo, operatori, has, abilitato, tick, refresh, toast, nomeOperatore, online]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={'toast toast-' + t.tipo}>{t.msg}</div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
