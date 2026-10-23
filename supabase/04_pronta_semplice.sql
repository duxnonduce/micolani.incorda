-- =====================================================================
-- Micolani Incorda — Aggiornamento 04
-- "Pronta" con un tocco: niente controllo su corde e tensioni,
-- e anche la segreteria può segnare una racchetta come pronta.
-- Da eseguire UNA VOLTA nel SQL Editor (dopo 01, 02 e 03).
-- =====================================================================

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
    perform public._richiedi_ruolo('incordatore','segreteria');
    update public.lavori set
      stato_lavoro = p_stato,
      iniziato_at = coalesce(iniziato_at, now()),
      iniziato_by = coalesce(iniziato_by, auth.uid()),
      incordatore_id = coalesce(incordatore_id, case when public.ha_ruolo('incordatore') then auth.uid() end),
      pronta_at = case when p_stato = 'pronta' then now() end,
      pronta_by = case when p_stato = 'pronta' then auth.uid() end
    where id = l.id;

  elsif (l.stato_lavoro, p_stato) = ('lavorazione','attesa') then
    perform public._richiedi_ruolo('incordatore','segreteria');
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


revoke execute on function public.cambia_stato_lavoro(uuid, text, text) from public, anon;
grant execute on function public.cambia_stato_lavoro(uuid, text, text) to authenticated;
