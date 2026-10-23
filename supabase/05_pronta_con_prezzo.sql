-- =====================================================================
-- Micolani Incorda — Aggiornamento 05
-- "Pronta" chiede il prezzo e lo salva insieme allo stato.
-- Da eseguire UNA VOLTA nel SQL Editor (dopo 01–04).
-- =====================================================================

-- 9.10 Segna pronta con il prezzo (un'unica operazione)
create or replace function public.segna_pronta(p_lavoro_id uuid, p_prezzo_cent integer)
returns void language plpgsql security definer set search_path = public as $$
declare
  l public.lavori;
  v_pagato integer;
begin
  perform public._richiedi_ruolo('incordatore','segreteria');
  perform public._set_rpc();
  select * into l from public.lavori where id = p_lavoro_id for update;
  if not found then raise exception 'Lavoro non trovato'; end if;
  if l.stato_lavoro = 'annullata' then raise exception 'Il lavoro % è annullato', l.codice; end if;
  if p_prezzo_cent is null or p_prezzo_cent < 0 then raise exception 'Indica il prezzo'; end if;

  v_pagato := public._pagato_netto(l.id);
  if p_prezzo_cent < v_pagato then
    raise exception 'Il prezzo non può essere inferiore a quanto già incassato (%)', public._euro(v_pagato);
  end if;

  if l.prezzo_cent is distinct from p_prezzo_cent then
    update public.lavori set
      prezzo_cent = p_prezzo_cent,
      motivo_gratuito = case when p_prezzo_cent = 0 then coalesce(nullif(btrim(l.motivo_gratuito), ''), 'Omaggio') end,
      prezzo_manodopera_cent = null, prezzo_corde_cent = null, prezzo_extra_cent = null, sconto_cent = null
    where id = l.id;
    perform public._log('prezzo', l.id, l.cliente_id, null,
      jsonb_build_object('da', l.prezzo_cent, 'a', p_prezzo_cent, 'nota', 'indicato quando è stata segnata pronta'));
  end if;

  if l.stato_lavoro <> 'pronta' then
    update public.lavori set
      stato_lavoro = 'pronta',
      iniziato_at = coalesce(iniziato_at, now()),
      iniziato_by = coalesce(iniziato_by, auth.uid()),
      incordatore_id = coalesce(incordatore_id, case when public.ha_ruolo('incordatore') then auth.uid() end),
      pronta_at = now(),
      pronta_by = auth.uid()
    where id = l.id;
    perform public._log('stato', l.id, l.cliente_id, null, jsonb_build_object('da', l.stato_lavoro, 'a', 'pronta'));
  end if;
end $$;

revoke execute on function public.segna_pronta(uuid, integer) from public, anon;
grant execute on function public.segna_pronta(uuid, integer) to authenticated;
