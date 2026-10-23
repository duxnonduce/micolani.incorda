-- =====================================================================
-- Micolani Incorda — Database v1 (Fase 1)
-- Da eseguire UNA SOLA VOLTA nel SQL Editor di un progetto Supabase nuovo.
-- Importi sempre in CENTESIMI (integer). Fuso orario: Europe/Rome.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- =====================================================================
-- 1. UTILITÀ
-- =====================================================================

create or replace function public._codice(p_prefisso text, p_n bigint, p_cifre int)
returns text language sql immutable as $$
  select p_prefisso || lpad(p_n::text, greatest(p_cifre, length(p_n::text)), '0');
$$;

create or replace function public._oggi()
returns date language sql stable as $$
  select (now() at time zone 'Europe/Rome')::date;
$$;

create or replace function public._euro(p_cent integer)
returns text language sql immutable as $$
  select replace(to_char(coalesce(p_cent, 0) / 100.0, 'FM999999990.00'), '.', ',') || ' €';
$$;

create or replace function public._is_rpc()
returns boolean language sql stable as $$
  select coalesce(current_setting('app.rpc', true), '') = '1';
$$;

create or replace function public._set_rpc()
returns void language sql as $$
  select set_config('app.rpc', '1', true);
$$;

-- =====================================================================
-- 2. PROFILI E RUOLI
-- =====================================================================

create table public.profili (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text not null default '',
  cognome text not null default '',
  ruoli text[] not null default '{}',
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profili_ruoli_validi check (ruoli <@ array['segreteria','incordatore','admin']::text[])
);

-- L'admin ha implicitamente tutti i ruoli
create or replace function public.ha_ruolo(variadic p_ruoli text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profili
    where id = auth.uid() and attivo
      and (ruoli && p_ruoli or 'admin' = any(ruoli))
  );
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profili
    where id = auth.uid() and attivo and cardinality(ruoli) > 0
  );
$$;

create or replace function public._richiedi_ruolo(variadic p_ruoli text[])
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.ha_ruolo(variadic p_ruoli) then
    raise exception 'Non hai i permessi per questa operazione' using errcode = '42501';
  end if;
end $$;

-- Ogni nuovo utente creato in Authentication riceve un profilo senza ruoli
create or replace function public._nuovo_utente()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profili (id, email, nome, cognome)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'nome', ''),
          coalesce(new.raw_user_meta_data->>'cognome', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public._nuovo_utente();

-- =====================================================================
-- 3. IDEMPOTENZA (protezione doppio tap) E STORICO
-- =====================================================================

create table public.richieste (
  request_id uuid primary key,
  risultato jsonb,
  operatore_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table public.eventi (
  id bigint generated always as identity primary key,
  tipo text not null,
  lavoro_id uuid,
  cliente_id uuid,
  pagamento_id uuid,
  dettagli jsonb not null default '{}',
  operatore_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index eventi_lavoro_idx on public.eventi (lavoro_id, created_at desc);
create index eventi_cliente_idx on public.eventi (cliente_id, created_at desc);
create index eventi_data_idx on public.eventi (created_at desc);

create or replace function public._log(p_tipo text, p_lavoro uuid, p_cliente uuid, p_pagamento uuid, p_dettagli jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into public.eventi (tipo, lavoro_id, cliente_id, pagamento_id, dettagli, operatore_id)
  values (p_tipo, p_lavoro, p_cliente, p_pagamento, coalesce(p_dettagli, '{}'::jsonb), auth.uid());
$$;

-- Restituisce NULL se la richiesta è nuova, altrimenti il risultato già salvato
create or replace function public._richiesta_gia_eseguita(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if p_request_id is null then
    raise exception 'Identificativo richiesta mancante';
  end if;
  insert into public.richieste (request_id) values (p_request_id) on conflict do nothing;
  if found then
    return null;
  end if;
  return coalesce((select risultato from public.richieste where request_id = p_request_id), '{}'::jsonb)
         || '{"duplicata": true}'::jsonb;
end $$;

create or replace function public._salva_risultato(p_request_id uuid, p_risultato jsonb)
returns void language sql security definer set search_path = public as $$
  update public.richieste set risultato = p_risultato where request_id = p_request_id;
$$;

-- =====================================================================
-- 4. CONTI E CLIENTI
-- =====================================================================

create sequence public.clienti_seq;

create table public.conti (
  id uuid primary key default gen_random_uuid(),
  intestatario_id uuid,
  descrizione text,
  created_at timestamptz not null default now()
);

create table public.clienti (
  id uuid primary key default gen_random_uuid(),
  codice text not null unique default public._codice('C', nextval('public.clienti_seq'), 4),
  nome text not null check (btrim(nome) <> ''),
  cognome text not null check (btrim(cognome) <> ''),
  telefono text,
  note text,
  conto_id uuid references public.conti(id),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.conti
  add constraint conti_intestatario_fk foreign key (intestatario_id)
  references public.clienti(id) deferrable initially deferred;

create index clienti_ricerca_idx on public.clienti
  using gin ((lower(nome || ' ' || cognome || ' ' || cognome || ' ' || coalesce(telefono, '') || ' ' || codice)) gin_trgm_ops);
create index clienti_conto_idx on public.clienti (conto_id);

-- Ogni nuovo cliente riceve automaticamente il proprio conto
create or replace function public._clienti_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.nome := btrim(new.nome);
  new.cognome := btrim(new.cognome);
  if new.conto_id is null then
    insert into public.conti (intestatario_id, descrizione)
    values (new.id, new.cognome || ' ' || new.nome)
    returning id into new.conto_id;
  end if;
  return new;
end $$;

create trigger clienti_before_insert before insert on public.clienti
  for each row execute function public._clienti_before_insert();

create or replace function public._clienti_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.conto_id is distinct from old.conto_id and not public._is_rpc() then
    perform public._richiedi_ruolo('admin');
  end if;
  if new.codice is distinct from old.codice then
    raise exception 'Il codice cliente non è modificabile';
  end if;
  new.nome := btrim(new.nome);
  new.cognome := btrim(new.cognome);
  new.updated_at := now();
  return new;
end $$;

create trigger clienti_before_update before update on public.clienti
  for each row execute function public._clienti_before_update();

-- =====================================================================
-- 5. RACCHETTE
-- =====================================================================

create table public.racchette (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clienti(id),
  marca text,
  modello text,
  identificazione text,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index racchette_cliente_idx on public.racchette (cliente_id);

create or replace function public._racchette_before_update()
returns trigger language plpgsql as $$
begin
  if new.cliente_id is distinct from old.cliente_id then
    raise exception 'Il proprietario della racchetta non è modificabile';
  end if;
  return new;
end $$;

create trigger racchette_before_update before update on public.racchette
  for each row execute function public._racchette_before_update();

-- =====================================================================
-- 6. LAVORI DI INCORDATURA
-- =====================================================================

create sequence public.lavori_seq;

create table public.lavori (
  id uuid primary key default gen_random_uuid(),
  codice text not null unique default public._codice('INC-', nextval('public.lavori_seq'), 5),
  cliente_id uuid not null references public.clienti(id),
  racchetta_id uuid not null references public.racchette(id),
  conto_id uuid not null references public.conti(id),

  consegnata_at timestamptz not null default now(),
  consegna_prevista timestamptz,
  priorita text not null default 'normale' check (priorita in ('normale','urgente')),
  incordatore_id uuid references public.profili(id),

  vert_marca text, vert_modello text, vert_calibro text,
  oriz_marca text, oriz_modello text, oriz_calibro text,
  tensione_vert numeric(4,1) check (tensione_vert between 5 and 40),
  tensione_oriz numeric(4,1) check (tensione_oriz between 5 and 40),
  prestretch_perc numeric(4,1) check (prestretch_perc between 0 and 50),
  nodi smallint check (nodi between 1 and 6),
  corde_fornite_da text check (corde_fornite_da in ('circolo','cliente')),
  note_tecniche text,
  note_interne text,
  posizione text,

  -- NULL = prezzo da definire (mai interpretato come zero)
  prezzo_cent integer check (prezzo_cent >= 0),
  prezzo_manodopera_cent integer check (prezzo_manodopera_cent >= 0),
  prezzo_corde_cent integer check (prezzo_corde_cent >= 0),
  prezzo_extra_cent integer check (prezzo_extra_cent >= 0),
  sconto_cent integer check (sconto_cent >= 0),
  motivo_gratuito text,

  stato_lavoro text not null default 'attesa'
    check (stato_lavoro in ('attesa','lavorazione','pronta','annullata')),
  iniziato_at timestamptz, iniziato_by uuid references public.profili(id),
  pronta_at timestamptz,   pronta_by uuid references public.profili(id),
  annullato_at timestamptz, annullato_by uuid references public.profili(id),
  motivo_annullamento text,

  ritirato boolean not null default false,
  ritirato_at timestamptz,
  ritirato_by uuid references public.profili(id),
  ritirato_da_nome text,
  ritiro_note text,

  created_at timestamptz not null default now(),
  created_by uuid references public.profili(id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profili(id),

  constraint lavori_gratuito_motivato
    check (prezzo_cent is distinct from 0 or nullif(btrim(motivo_gratuito), '') is not null),
  constraint lavori_annullo_motivato
    check (stato_lavoro <> 'annullata' or nullif(btrim(motivo_annullamento), '') is not null),
  constraint lavori_ritiro_coerente
    check ((ritirato and ritirato_at is not null) or (not ritirato and ritirato_at is null))
);

create index lavori_cliente_idx on public.lavori (cliente_id);
create index lavori_conto_idx on public.lavori (conto_id);
create index lavori_racchetta_idx on public.lavori (racchetta_id);
create index lavori_coda_idx on public.lavori (stato_lavoro, priorita, consegna_prevista, consegnata_at);
create index lavori_ritiro_idx on public.lavori (ritirato, ritirato_at);

-- Inserimento solo tramite la funzione crea_lavori
create or replace function public._lavori_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public._is_rpc() then
    raise exception 'Usa la funzione crea_lavori per inserire un lavoro' using errcode = '42501';
  end if;
  if not exists (select 1 from public.racchette where id = new.racchetta_id and cliente_id = new.cliente_id) then
    raise exception 'La racchetta non appartiene a questo cliente';
  end if;
  select conto_id into new.conto_id from public.clienti where id = new.cliente_id;
  return new;
end $$;

create trigger lavori_before_insert before insert on public.lavori
  for each row execute function public._lavori_before_insert();

-- Modifiche dirette: dati tecnici (incordatore/segreteria), dati di servizio (segreteria).
-- Prezzo, stati, ritiro: solo tramite le funzioni dedicate.
create or replace function public._lavori_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb := to_jsonb(old);
  v_new jsonb := to_jsonb(new);
  v_changed text[];
  v_diff jsonb;
  k text;
  c_tecnici text[] := array['vert_marca','vert_modello','vert_calibro','oriz_marca','oriz_modello','oriz_calibro',
                            'tensione_vert','tensione_oriz','prestretch_perc','nodi','corde_fornite_da',
                            'note_tecniche','posizione','incordatore_id'];
  c_segreteria text[] := array['consegnata_at','consegna_prevista','priorita','note_interne','racchetta_id'];
begin
  select array_agg(e.key) into v_changed
  from jsonb_each(v_new) e
  where e.value is distinct from v_old -> e.key
    and e.key not in ('updated_at','updated_by');

  if v_changed is null then
    return new;
  end if;

  if not public._is_rpc() then
    foreach k in array v_changed loop
      if k = any(c_tecnici) then
        perform public._richiedi_ruolo('incordatore','segreteria');
      elsif k = any(c_segreteria) then
        perform public._richiedi_ruolo('segreteria');
      else
        raise exception 'Il campo "%" si modifica solo con l''operazione dedicata', k using errcode = '42501';
      end if;
    end loop;

    if old.stato_lavoro = 'annullata' then
      perform public._richiedi_ruolo('admin');
    end if;

    if new.racchetta_id is distinct from old.racchetta_id
       and not exists (select 1 from public.racchette where id = new.racchetta_id and cliente_id = new.cliente_id) then
      raise exception 'La racchetta non appartiene a questo cliente';
    end if;

    select jsonb_object_agg(c, jsonb_build_object('da', v_old -> c, 'a', v_new -> c))
      into v_diff from unnest(v_changed) c;
    perform public._log('modifica', new.id, new.cliente_id, null, v_diff);
  end if;

  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger lavori_before_update before update on public.lavori
  for each row execute function public._lavori_before_update();

create or replace function public._no_delete()
returns trigger language plpgsql as $$
begin
  raise exception 'Questo dato non può essere cancellato: usa annullamento o storno' using errcode = '42501';
end $$;

create trigger lavori_no_delete before delete on public.lavori
  for each row execute function public._no_delete();

-- =====================================================================
-- 7. PAGAMENTI (un movimento unico, ripartito sui lavori)
-- =====================================================================

create table public.pagamenti (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'incasso' check (tipo in ('incasso','rimborso')),
  conto_id uuid not null references public.conti(id),
  importo_cent integer not null check (importo_cent > 0),
  data_pagamento date not null default public._oggi(),
  metodo text not null check (metodo in ('contanti','pos','bonifico','altro')),
  nota text,
  operatore_id uuid references public.profili(id) default auth.uid(),
  created_at timestamptz not null default now(),
  stornato boolean not null default false,
  storno_motivo text,
  stornato_at timestamptz,
  stornato_by uuid references public.profili(id),
  constraint pagamenti_storno_motivato
    check (not stornato or nullif(btrim(storno_motivo), '') is not null)
);
create index pagamenti_conto_idx on public.pagamenti (conto_id, data_pagamento desc);
create index pagamenti_data_idx on public.pagamenti (data_pagamento desc);

create table public.pagamenti_lavori (
  pagamento_id uuid not null references public.pagamenti(id),
  lavoro_id uuid not null references public.lavori(id),
  importo_cent integer not null check (importo_cent > 0),
  primary key (pagamento_id, lavoro_id)
);
create index pagamenti_lavori_lavoro_idx on public.pagamenti_lavori (lavoro_id);

create trigger pagamenti_no_delete before delete on public.pagamenti
  for each row execute function public._no_delete();
create trigger pagamenti_lavori_no_delete before delete on public.pagamenti_lavori
  for each row execute function public._no_delete();

-- Pagato netto valido (incassi − rimborsi, esclusi gli stornati)
create or replace function public._pagato_netto(p_lavoro uuid)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when p.tipo = 'incasso' then pl.importo_cent else -pl.importo_cent end), 0)::int
  from public.pagamenti_lavori pl
  join public.pagamenti p on p.id = pl.pagamento_id
  where pl.lavoro_id = p_lavoro and not p.stornato;
$$;

-- =====================================================================
-- 8. LISTINO E IMPOSTAZIONI
-- =====================================================================

create table public.listino (
  id uuid primary key default gen_random_uuid(),
  descrizione text not null,
  manodopera_cent integer not null default 0 check (manodopera_cent >= 0),
  corde_cent integer not null default 0 check (corde_cent >= 0),
  attivo boolean not null default true,
  ordine int not null default 0,
  created_at timestamptz not null default now()
);

create table public.impostazioni (
  chiave text primary key,
  valore jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.impostazioni (chiave, valore) values
  ('soglie_avvisi', '{"pronta_da_giorni": 7, "ritirata_non_pagata_giorni": 7}');

-- =====================================================================
-- 9. FUNZIONI OPERATIVE (chiamate dall'app)
-- =====================================================================

-- 9.1 Inserimento di uno o più lavori per lo stesso cliente.
-- p_lavori: array JSON; ogni elemento ha "racchetta_id" oppure
-- "racchetta": {marca, modello, identificazione, note}, più i campi del lavoro.
create or replace function public.crea_lavori(p_request_id uuid, p_cliente_id uuid, p_lavori jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_dup jsonb;
  v_item jsonb;
  v_l public.lavori;
  v_racc uuid;
  v_id uuid;
  v_codice text;
  v_out jsonb := '[]'::jsonb;
begin
  perform public._richiedi_ruolo('segreteria','incordatore');
  v_dup := public._richiesta_gia_eseguita(p_request_id);
  if v_dup is not null then return v_dup; end if;
  perform public._set_rpc();

  if jsonb_typeof(p_lavori) is distinct from 'array' or jsonb_array_length(p_lavori) = 0 then
    raise exception 'Nessun lavoro da inserire';
  end if;
  if not exists (select 1 from public.clienti where id = p_cliente_id) then
    raise exception 'Cliente non trovato';
  end if;

  for v_item in select value from jsonb_array_elements(p_lavori) loop
    v_racc := nullif(v_item ->> 'racchetta_id', '')::uuid;
    if v_racc is null then
      insert into public.racchette (cliente_id, marca, modello, identificazione, note)
      values (p_cliente_id,
              nullif(btrim(v_item -> 'racchetta' ->> 'marca'), ''),
              nullif(btrim(v_item -> 'racchetta' ->> 'modello'), ''),
              nullif(btrim(v_item -> 'racchetta' ->> 'identificazione'), ''),
              nullif(btrim(v_item -> 'racchetta' ->> 'note'), ''))
      returning id into v_racc;
    end if;

    v_l := jsonb_populate_record(null::public.lavori, v_item - 'racchetta');

    insert into public.lavori (
      cliente_id, racchetta_id, consegnata_at, consegna_prevista, priorita, incordatore_id,
      vert_marca, vert_modello, vert_calibro, oriz_marca, oriz_modello, oriz_calibro,
      tensione_vert, tensione_oriz, prestretch_perc, nodi, corde_fornite_da,
      note_tecniche, note_interne, posizione,
      prezzo_cent, prezzo_manodopera_cent, prezzo_corde_cent, prezzo_extra_cent, sconto_cent, motivo_gratuito)
    values (
      p_cliente_id, v_racc, coalesce(v_l.consegnata_at, now()), v_l.consegna_prevista,
      coalesce(v_l.priorita, 'normale'), v_l.incordatore_id,
      v_l.vert_marca, v_l.vert_modello, v_l.vert_calibro, v_l.oriz_marca, v_l.oriz_modello, v_l.oriz_calibro,
      v_l.tensione_vert, v_l.tensione_oriz, v_l.prestretch_perc, v_l.nodi, v_l.corde_fornite_da,
      v_l.note_tecniche, v_l.note_interne, v_l.posizione,
      v_l.prezzo_cent, v_l.prezzo_manodopera_cent, v_l.prezzo_corde_cent, v_l.prezzo_extra_cent,
      v_l.sconto_cent, v_l.motivo_gratuito)
    returning id, codice into v_id, v_codice;

    perform public._log('creazione', v_id, p_cliente_id, null,
      jsonb_build_object('codice', v_codice, 'prezzo_cent', v_l.prezzo_cent));
    v_out := v_out || jsonb_build_object('id', v_id, 'codice', v_codice);
  end loop;

  v_out := jsonb_build_object('lavori', v_out);
  perform public._salva_risultato(p_request_id, v_out);
  return v_out;
end $$;

-- 9.2 Cambio di stato della lavorazione
create or replace function public.cambia_stato_lavoro(p_lavoro_id uuid, p_stato text, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  l public.lavori;
begin
  perform public._set_rpc();
  select * into l from public.lavori where id = p_lavoro_id for update;
  if not found then raise exception 'Lavoro non trovato'; end if;

  if l.stato_lavoro = p_stato then return; end if;  -- doppio tap: nessun effetto
  if l.stato_lavoro = 'annullata' then raise exception 'Il lavoro % è annullato', l.codice; end if;

  if p_stato = 'annullata' then
    perform public._richiedi_ruolo('admin');
    if nullif(btrim(p_motivo), '') is null then raise exception 'Indica il motivo dell''annullamento'; end if;
    if l.ritirato then
      raise exception 'La racchetta è già stata ritirata: per non addebitare il lavoro imposta un prezzo omaggio';
    end if;
    update public.lavori set stato_lavoro = 'annullata', annullato_at = now(), annullato_by = auth.uid(),
      motivo_annullamento = btrim(p_motivo)
    where id = l.id;

  elsif (l.stato_lavoro, p_stato) in (('attesa','lavorazione'), ('attesa','pronta'), ('lavorazione','pronta')) then
    perform public._richiedi_ruolo('incordatore');
    if l.tensione_vert is null or l.tensione_oriz is null
       or coalesce(l.vert_marca, l.vert_modello) is null
       or coalesce(l.oriz_marca, l.oriz_modello) is null then
      raise exception 'Completa corde e tensioni del lavoro % prima di procedere', l.codice;
    end if;
    update public.lavori set
      stato_lavoro = p_stato,
      iniziato_at = coalesce(iniziato_at, now()),
      iniziato_by = coalesce(iniziato_by, auth.uid()),
      incordatore_id = coalesce(incordatore_id, auth.uid()),
      pronta_at = case when p_stato = 'pronta' then now() end,
      pronta_by = case when p_stato = 'pronta' then auth.uid() end
    where id = l.id;

  elsif (l.stato_lavoro, p_stato) = ('lavorazione','attesa') then
    perform public._richiedi_ruolo('incordatore');
    update public.lavori set stato_lavoro = 'attesa', iniziato_at = null, iniziato_by = null where id = l.id;

  elsif l.stato_lavoro = 'pronta' and p_stato in ('attesa','lavorazione') then
    perform public._richiedi_ruolo('admin');
    if nullif(btrim(p_motivo), '') is null then raise exception 'Indica il motivo della correzione'; end if;
    if l.ritirato then raise exception 'La racchetta è già stata ritirata'; end if;
    update public.lavori set stato_lavoro = p_stato, pronta_at = null, pronta_by = null,
      iniziato_at = case when p_stato = 'attesa' then null else iniziato_at end,
      iniziato_by = case when p_stato = 'attesa' then null else iniziato_by end
    where id = l.id;

  else
    raise exception 'Passaggio di stato non valido';
  end if;

  perform public._log('stato', l.id, l.cliente_id, null,
    jsonb_build_object('da', l.stato_lavoro, 'a', p_stato, 'motivo', nullif(btrim(p_motivo), '')));
end $$;

-- 9.3 Impostazione o modifica del prezzo
create or replace function public.imposta_prezzo(
  p_lavoro_id uuid,
  p_prezzo_cent integer,
  p_motivo_gratuito text default null,
  p_nota text default null,
  p_manodopera_cent integer default null,
  p_corde_cent integer default null,
  p_extra_cent integer default null,
  p_sconto_cent integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  l public.lavori;
  v_pagato integer;
begin
  perform public._richiedi_ruolo('segreteria');
  perform public._set_rpc();
  select * into l from public.lavori where id = p_lavoro_id for update;
  if not found then raise exception 'Lavoro non trovato'; end if;
  if l.stato_lavoro = 'annullata' then raise exception 'Il lavoro è annullato'; end if;

  v_pagato := public._pagato_netto(l.id);

  if p_prezzo_cent is null and v_pagato > 0 then
    raise exception 'Ci sono già pagamenti: il prezzo non può tornare "da definire"';
  end if;
  if p_prezzo_cent < 0 then raise exception 'Prezzo non valido'; end if;
  if p_prezzo_cent < v_pagato then
    raise exception 'Il prezzo non può essere inferiore a quanto già incassato (%). Registra prima un rimborso.',
      public._euro(v_pagato);
  end if;
  if p_prezzo_cent = 0 and nullif(btrim(p_motivo_gratuito), '') is null then
    raise exception 'Per un lavoro gratuito indica il motivo';
  end if;

  update public.lavori set
    prezzo_cent = p_prezzo_cent,
    motivo_gratuito = case when p_prezzo_cent = 0 then btrim(p_motivo_gratuito) end,
    prezzo_manodopera_cent = p_manodopera_cent,
    prezzo_corde_cent = p_corde_cent,
    prezzo_extra_cent = p_extra_cent,
    sconto_cent = p_sconto_cent
  where id = l.id;

  if l.prezzo_cent is distinct from p_prezzo_cent or l.sconto_cent is distinct from p_sconto_cent then
    perform public._log('prezzo', l.id, l.cliente_id, null, jsonb_build_object(
      'da', l.prezzo_cent, 'a', p_prezzo_cent, 'sconto_cent', p_sconto_cent,
      'motivo_gratuito', nullif(btrim(p_motivo_gratuito), ''), 'nota', nullif(btrim(p_nota), '')));
  end if;
end $$;

-- 9.4 Movimento economico (interno): un solo pagamento ripartito su più lavori
-- p_attribuzioni: [{"lavoro_id": "...", "importo_cent": 2000}, ...]
create or replace function public._registra_movimento(
  p_tipo text, p_conto_id uuid, p_importo_cent integer, p_data date,
  p_metodo text, p_nota text, p_attribuzioni jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[];
  v_item jsonb;
  v_lid uuid;
  v_imp integer;
  v_tot integer := 0;
  v_pagato integer;
  v_id uuid;
  l public.lavori;
begin
  if p_importo_cent is null or p_importo_cent <= 0 then raise exception 'Importo non valido'; end if;
  if p_metodo is null or p_metodo not in ('contanti','pos','bonifico','altro') then
    raise exception 'Metodo di pagamento non valido';
  end if;
  if jsonb_typeof(p_attribuzioni) is distinct from 'array' or jsonb_array_length(p_attribuzioni) = 0 then
    raise exception 'Seleziona almeno un lavoro';
  end if;

  select array_agg(distinct (e ->> 'lavoro_id')::uuid) into v_ids from jsonb_array_elements(p_attribuzioni) e;
  if cardinality(v_ids) <> jsonb_array_length(p_attribuzioni) then
    raise exception 'Lo stesso lavoro compare più volte';
  end if;

  -- blocco dei lavori coinvolti: nessun altro operatore può incassarli in contemporanea
  perform 1 from public.lavori where id = any(v_ids) order by id for update;

  insert into public.pagamenti (tipo, conto_id, importo_cent, data_pagamento, metodo, nota, operatore_id)
  values (p_tipo, p_conto_id, p_importo_cent, coalesce(p_data, public._oggi()), p_metodo,
          nullif(btrim(p_nota), ''), auth.uid())
  returning id into v_id;

  for v_item in select value from jsonb_array_elements(p_attribuzioni) loop
    v_lid := (v_item ->> 'lavoro_id')::uuid;
    v_imp := (v_item ->> 'importo_cent')::integer;
    if v_imp is null or v_imp <= 0 then raise exception 'Importo attribuito non valido'; end if;

    select * into l from public.lavori where id = v_lid;
    if not found then raise exception 'Lavoro non trovato'; end if;
    if l.conto_id <> p_conto_id then
      raise exception 'Il lavoro % non appartiene a questo conto', l.codice;
    end if;

    v_pagato := public._pagato_netto(v_lid);

    if p_tipo = 'incasso' then
      if l.stato_lavoro = 'annullata' then
        raise exception 'Il lavoro % è annullato', l.codice;
      end if;
      if l.prezzo_cent is null then
        raise exception 'Il lavoro % ha il prezzo da definire: confermalo prima di incassare', l.codice;
      end if;
      if v_imp > l.prezzo_cent - v_pagato then
        raise exception 'Importo superiore al residuo del lavoro % (residuo %)',
          l.codice, public._euro(l.prezzo_cent - v_pagato);
      end if;
    else
      if v_imp > v_pagato then
        raise exception 'Rimborso superiore a quanto incassato sul lavoro % (%)', l.codice, public._euro(v_pagato);
      end if;
    end if;

    insert into public.pagamenti_lavori (pagamento_id, lavoro_id, importo_cent) values (v_id, v_lid, v_imp);
    v_tot := v_tot + v_imp;

    perform public._log(p_tipo, v_lid, l.cliente_id, v_id,
      jsonb_build_object('importo_cent', v_imp, 'totale_movimento_cent', p_importo_cent, 'metodo', p_metodo));
  end loop;

  if v_tot <> p_importo_cent then
    raise exception 'La ripartizione (%) non corrisponde all''importo (%)', public._euro(v_tot), public._euro(p_importo_cent);
  end if;

  return v_id;
end $$;

-- 9.5 Registrazione di un pagamento (anche giorni dopo il ritiro, anche in anticipo)
create or replace function public.registra_pagamento(
  p_request_id uuid,
  p_conto_id uuid,
  p_importo_cent integer,
  p_metodo text,
  p_attribuzioni jsonb,
  p_data date default null,
  p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_dup jsonb;
  v_id uuid;
  v_out jsonb;
begin
  perform public._richiedi_ruolo('segreteria');
  v_dup := public._richiesta_gia_eseguita(p_request_id);
  if v_dup is not null then return v_dup; end if;
  perform public._set_rpc();

  v_id := public._registra_movimento('incasso', p_conto_id, p_importo_cent, p_data, p_metodo, p_nota, p_attribuzioni);
  v_out := jsonb_build_object('pagamento_id', v_id);
  perform public._salva_risultato(p_request_id, v_out);
  return v_out;
end $$;

-- 9.6 Ritiro di una o più racchette, con pagamento facoltativo nella stessa operazione.
-- p_pagamento: null (ritira senza pagare) oppure
-- {"importo_cent": 4000, "metodo": "contanti", "nota": "...", "attribuzioni": [...]}
create or replace function public.registra_ritiro(
  p_request_id uuid,
  p_lavori uuid[],
  p_ritirato_da text default null,
  p_note text default null,
  p_pagamento jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_dup jsonb;
  v_conto uuid;
  v_n integer;
  v_pag uuid;
  v_out jsonb;
  l public.lavori;
begin
  perform public._richiedi_ruolo('segreteria');
  v_dup := public._richiesta_gia_eseguita(p_request_id);
  if v_dup is not null then return v_dup; end if;
  perform public._set_rpc();

  if p_lavori is null or cardinality(p_lavori) = 0 then raise exception 'Seleziona almeno una racchetta'; end if;

  perform 1 from public.lavori where id = any(p_lavori) order by id for update;

  select count(*), min(conto_id::text)::uuid into v_n, v_conto from public.lavori where id = any(p_lavori);
  if v_n <> (select count(distinct x) from unnest(p_lavori) x) then raise exception 'Lavoro non trovato'; end if;
  if (select count(distinct conto_id) from public.lavori where id = any(p_lavori)) > 1 then
    raise exception 'Le racchette selezionate appartengono a conti diversi';
  end if;

  for l in select * from public.lavori where id = any(p_lavori) order by codice loop
    if l.ritirato then
      raise exception 'La racchetta del lavoro % risulta già ritirata', l.codice;
    end if;
    if l.prezzo_cent is null and l.stato_lavoro <> 'annullata' then
      raise exception 'Conferma il prezzo del lavoro % prima del ritiro', l.codice;
    end if;
  end loop;

  if p_pagamento is not null then
    v_pag := public._registra_movimento('incasso', v_conto,
      (p_pagamento ->> 'importo_cent')::integer,
      nullif(p_pagamento ->> 'data', '')::date,
      p_pagamento ->> 'metodo',
      p_pagamento ->> 'nota',
      p_pagamento -> 'attribuzioni');
  end if;

  update public.lavori set
    ritirato = true,
    ritirato_at = now(),
    ritirato_by = auth.uid(),
    ritirato_da_nome = nullif(btrim(p_ritirato_da), ''),
    ritiro_note = nullif(btrim(p_note), '')
  where id = any(p_lavori);

  for l in select * from public.lavori where id = any(p_lavori) loop
    perform public._log('ritiro', l.id, l.cliente_id, v_pag, jsonb_build_object(
      'ritirato_da', l.ritirato_da_nome, 'note', l.ritiro_note, 'stato_lavoro', l.stato_lavoro));
  end loop;

  v_out := jsonb_build_object('ritirati', cardinality(p_lavori), 'pagamento_id', v_pag);
  perform public._salva_risultato(p_request_id, v_out);
  return v_out;
end $$;

-- 9.7 Correzione di un ritiro registrato per errore (non tocca i pagamenti)
create or replace function public.annulla_ritiro(p_lavoro_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  l public.lavori;
begin
  perform public._richiedi_ruolo('admin');
  perform public._set_rpc();
  if nullif(btrim(p_motivo), '') is null then raise exception 'Indica il motivo della correzione'; end if;
  select * into l from public.lavori where id = p_lavoro_id for update;
  if not found then raise exception 'Lavoro non trovato'; end if;
  if not l.ritirato then return; end if;

  update public.lavori set ritirato = false, ritirato_at = null, ritirato_by = null,
    ritirato_da_nome = null, ritiro_note = null
  where id = l.id;

  perform public._log('annullo_ritiro', l.id, l.cliente_id, null, jsonb_build_object(
    'motivo', btrim(p_motivo), 'ritirato_at', l.ritirato_at, 'ritirato_by', l.ritirato_by,
    'ritirato_da', l.ritirato_da_nome));
end $$;

-- 9.8 Storno di un pagamento errato: il movimento resta nello storico, il saldo si ricalcola
create or replace function public.storna_pagamento(p_pagamento_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  p public.pagamenti;
  r record;
begin
  perform public._richiedi_ruolo('admin');
  perform public._set_rpc();
  if nullif(btrim(p_motivo), '') is null then raise exception 'Indica il motivo dello storno'; end if;

  select * into p from public.pagamenti where id = p_pagamento_id for update;
  if not found then raise exception 'Pagamento non trovato'; end if;
  if p.stornato then return; end if;

  perform 1 from public.lavori
  where id in (select lavoro_id from public.pagamenti_lavori where pagamento_id = p.id)
  order by id for update;

  -- stornare un rimborso fa risalire il pagato: non deve superare il prezzo
  if p.tipo = 'rimborso' then
    for r in
      select l.codice, l.prezzo_cent, l.stato_lavoro, pl.importo_cent, public._pagato_netto(l.id) as pagato
      from public.pagamenti_lavori pl join public.lavori l on l.id = pl.lavoro_id
      where pl.pagamento_id = p.id
    loop
      if r.stato_lavoro <> 'annullata' and r.pagato + r.importo_cent > coalesce(r.prezzo_cent, 0) then
        raise exception 'Lo storno porterebbe il pagato del lavoro % oltre il prezzo', r.codice;
      end if;
    end loop;
  end if;

  update public.pagamenti set stornato = true, storno_motivo = btrim(p_motivo),
    stornato_at = now(), stornato_by = auth.uid()
  where id = p.id;

  for r in
    select pl.lavoro_id, pl.importo_cent, l.cliente_id
    from public.pagamenti_lavori pl join public.lavori l on l.id = pl.lavoro_id
    where pl.pagamento_id = p.id
  loop
    perform public._log('storno', r.lavoro_id, r.cliente_id, p.id, jsonb_build_object(
      'tipo_movimento', p.tipo, 'importo_cent', r.importo_cent, 'motivo', btrim(p_motivo)));
  end loop;
end $$;

-- 9.9 Rimborso (es. lavoro annullato dopo il pagamento): l'incasso originale resta
create or replace function public.registra_rimborso(
  p_request_id uuid, p_lavoro_id uuid, p_importo_cent integer, p_metodo text, p_motivo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_dup jsonb;
  v_conto uuid;
  v_id uuid;
  v_out jsonb;
begin
  perform public._richiedi_ruolo('admin');
  v_dup := public._richiesta_gia_eseguita(p_request_id);
  if v_dup is not null then return v_dup; end if;
  perform public._set_rpc();
  if nullif(btrim(p_motivo), '') is null then raise exception 'Indica il motivo del rimborso'; end if;

  select conto_id into v_conto from public.lavori where id = p_lavoro_id;
  if not found then raise exception 'Lavoro non trovato'; end if;

  v_id := public._registra_movimento('rimborso', v_conto, p_importo_cent, null, p_metodo, p_motivo,
    jsonb_build_array(jsonb_build_object('lavoro_id', p_lavoro_id, 'importo_cent', p_importo_cent)));
  v_out := jsonb_build_object('pagamento_id', v_id);
  perform public._salva_risultato(p_request_id, v_out);
  return v_out;
end $$;

-- =====================================================================
-- 10. VISTE PER L'APP
-- =====================================================================

create view public.v_lavori with (security_invoker = true) as
select
  l.*,
  c.codice as cliente_codice, c.nome as cliente_nome, c.cognome as cliente_cognome,
  c.telefono as cliente_telefono,
  r.marca as racchetta_marca, r.modello as racchetta_modello,
  r.identificazione as racchetta_identificazione,
  coalesce(p.pagato, 0) as pagato_cent,
  case when l.stato_lavoro = 'annullata' or l.prezzo_cent is null then null
       else l.prezzo_cent - coalesce(p.pagato, 0) end as residuo_cent,
  case
    when l.stato_lavoro = 'annullata' then
      case when coalesce(p.pagato, 0) > 0 then 'da_rimborsare' else 'annullato' end
    when l.prezzo_cent is null then 'da_definire'
    when l.prezzo_cent = 0 then 'omaggio'
    when coalesce(p.pagato, 0) >= l.prezzo_cent then 'pagata'
    when coalesce(p.pagato, 0) > 0 then 'parziale'
    else 'da_pagare'
  end as stato_pagamento
from public.lavori l
join public.clienti c on c.id = l.cliente_id
join public.racchette r on r.id = l.racchetta_id
left join lateral (
  select sum(case when pg.tipo = 'incasso' then pl.importo_cent else -pl.importo_cent end)::int as pagato
  from public.pagamenti_lavori pl
  join public.pagamenti pg on pg.id = pl.pagamento_id
  where pl.lavoro_id = l.id and not pg.stornato
) p on true;

create view public.v_saldi_clienti with (security_invoker = true) as
select
  c.id as cliente_id, c.codice, c.nome, c.cognome, c.telefono, c.conto_id,
  count(v.id) filter (where v.residuo_cent > 0) as lavori_da_pagare,
  count(v.id) filter (where v.stato_pagamento = 'da_definire') as lavori_prezzo_da_definire,
  coalesce(sum(v.residuo_cent) filter (where v.residuo_cent > 0), 0)::int as residuo_totale_cent,
  coalesce(sum(v.residuo_cent) filter (where v.residuo_cent > 0 and v.ritirato), 0)::int as residuo_ritirate_cent,
  coalesce(sum(v.residuo_cent) filter (where v.residuo_cent > 0 and not v.ritirato), 0)::int as residuo_al_circolo_cent,
  min(v.ritirato_at) filter (where v.residuo_cent > 0 and v.ritirato) as primo_ritiro_non_saldato,
  count(v.id) filter (where not v.ritirato and v.stato_lavoro <> 'annullata') as racchette_al_circolo,
  count(v.id) filter (where not v.ritirato and v.stato_lavoro = 'pronta') as racchette_pronte
from public.clienti c
left join public.v_lavori v on v.cliente_id = c.id
group by c.id;

create view public.v_saldi_conti with (security_invoker = true) as
select
  v.conto_id,
  count(v.id) filter (where v.residuo_cent > 0) as lavori_da_pagare,
  coalesce(sum(v.residuo_cent) filter (where v.residuo_cent > 0), 0)::int as residuo_totale_cent,
  coalesce(sum(v.residuo_cent) filter (where v.residuo_cent > 0 and v.ritirato), 0)::int as residuo_ritirate_cent,
  coalesce(sum(v.residuo_cent) filter (where v.residuo_cent > 0 and not v.ritirato), 0)::int as residuo_al_circolo_cent,
  min(v.ritirato_at) filter (where v.residuo_cent > 0 and v.ritirato) as primo_ritiro_non_saldato
from public.v_lavori v
group by v.conto_id;

create view public.v_riepilogo with (security_invoker = true) as
select
  count(*) filter (where stato_lavoro = 'attesa') as in_attesa,
  count(*) filter (where stato_lavoro = 'lavorazione') as in_lavorazione,
  count(*) filter (where stato_lavoro = 'pronta' and not ritirato) as pronte_da_ritirare,
  count(*) filter (where ritirato and residuo_cent > 0) as ritirate_con_saldo_aperto,
  coalesce(sum(residuo_cent) filter (where ritirato and residuo_cent > 0), 0)::int as da_riscuotere_ritirate_cent,
  count(*) filter (where stato_lavoro in ('attesa','lavorazione') and consegna_prevista < now()) as consegne_superate,
  count(*) filter (where stato_lavoro in ('attesa','lavorazione') and priorita = 'urgente') as urgenti,
  (select coalesce(sum(case when tipo = 'incasso' then importo_cent else -importo_cent end), 0)::int
     from public.pagamenti where data_pagamento = public._oggi() and not stornato) as incassi_oggi_cent
from public.v_lavori;

-- =====================================================================
-- 11. SICUREZZA (RLS): nessun accesso senza account e ruolo
-- =====================================================================

alter table public.profili enable row level security;
alter table public.richieste enable row level security;
alter table public.eventi enable row level security;
alter table public.conti enable row level security;
alter table public.clienti enable row level security;
alter table public.racchette enable row level security;
alter table public.lavori enable row level security;
alter table public.pagamenti enable row level security;
alter table public.pagamenti_lavori enable row level security;
alter table public.listino enable row level security;
alter table public.impostazioni enable row level security;

create policy profili_select on public.profili for select to authenticated
  using (id = auth.uid() or public.is_staff());
create policy profili_admin on public.profili for update to authenticated
  using (public.ha_ruolo('admin')) with check (public.ha_ruolo('admin'));

create policy eventi_select on public.eventi for select to authenticated using (public.is_staff());
create policy conti_select on public.conti for select to authenticated using (public.is_staff());

create policy clienti_select on public.clienti for select to authenticated using (public.is_staff());
create policy clienti_insert on public.clienti for insert to authenticated with check (public.ha_ruolo('segreteria','incordatore'));
create policy clienti_update on public.clienti for update to authenticated
  using (public.ha_ruolo('segreteria')) with check (public.ha_ruolo('segreteria'));

create policy racchette_select on public.racchette for select to authenticated using (public.is_staff());
create policy racchette_insert on public.racchette for insert to authenticated with check (public.ha_ruolo('segreteria','incordatore'));
create policy racchette_update on public.racchette for update to authenticated
  using (public.ha_ruolo('segreteria')) with check (public.ha_ruolo('segreteria'));

create policy lavori_select on public.lavori for select to authenticated using (public.is_staff());
create policy lavori_update on public.lavori for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy pagamenti_select on public.pagamenti for select to authenticated using (public.is_staff());
create policy pagamenti_lavori_select on public.pagamenti_lavori for select to authenticated using (public.is_staff());

create policy listino_select on public.listino for select to authenticated using (public.is_staff());
create policy listino_admin on public.listino for all to authenticated
  using (public.ha_ruolo('admin')) with check (public.ha_ruolo('admin'));
create policy impostazioni_select on public.impostazioni for select to authenticated using (public.is_staff());
create policy impostazioni_admin on public.impostazioni for all to authenticated
  using (public.ha_ruolo('admin')) with check (public.ha_ruolo('admin'));

-- Funzioni: solo quelle operative sono richiamabili dall'app
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.ha_ruolo(text[]), public.is_staff(), public._oggi(), public._euro(integer), public._codice(text, bigint, integer),
  public.crea_lavori(uuid, uuid, jsonb),
  public.cambia_stato_lavoro(uuid, text, text),
  public.imposta_prezzo(uuid, integer, text, text, integer, integer, integer, integer),
  public.registra_pagamento(uuid, uuid, integer, text, jsonb, date, text),
  public.registra_ritiro(uuid, uuid[], text, text, jsonb),
  public.annulla_ritiro(uuid, text),
  public.storna_pagamento(uuid, text),
  public.registra_rimborso(uuid, uuid, integer, text, text)
to authenticated;
grant usage on sequence public.clienti_seq to authenticated;

-- =====================================================================
-- 12. AGGIORNAMENTI IN TEMPO REALE
-- =====================================================================

alter publication supabase_realtime add table
  public.lavori, public.pagamenti, public.pagamenti_lavori, public.clienti, public.eventi;
