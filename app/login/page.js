'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useApp } from '@/components/AppProvider';
import { Campo } from '@/components/ui';
import { erroreMsg } from '@/lib/format';

export default function Login() {
  const { session } = useApp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState('');

  useEffect(() => {
    if (session) router.replace('/');
  }, [session, router]);

  async function entra(e) {
    e.preventDefault();
    setErrore('');
    setBusy(true);
    const { error } = await supabase().auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      setErrore(/Invalid login/i.test(error.message) ? 'Email o password non corretti.' : erroreMsg(error));
    }
  }

  return (
    <div className="centro">
      <form className="login card" onSubmit={entra}>
        <div className="login-logo">
          <img src="/icon.svg" alt="" />
          <div className="stack-0">
            <strong>Micolani Incorda</strong>
            <span className="muted small">Accesso riservato agli operatori</span>
          </div>
        </div>
        <Campo label="Email">
          <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Campo>
        <Campo label="Password">
          <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </Campo>
        {errore && <div className="errore">{errore}</div>}
        <button className="btn btn-primary btn-big" disabled={busy}>{busy ? 'Accesso…' : 'Entra'}</button>
      </form>
    </div>
  );
}
