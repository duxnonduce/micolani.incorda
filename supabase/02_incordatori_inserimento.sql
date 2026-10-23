-- =====================================================================
-- Micolani Incorda — Aggiornamento 02
-- Gli incordatori possono inserire clienti, racchette e nuove incordature.
-- Da eseguire UNA VOLTA nel SQL Editor (dopo lo script 01).
-- =====================================================================

drop policy if exists clienti_insert on public.clienti;
create policy clienti_insert on public.clienti for insert to authenticated
  with check (public.ha_ruolo('segreteria','incordatore'));

drop policy if exists racchette_insert on public.racchette;
create policy racchette_insert on public.racchette for insert to authenticated
  with check (public.ha_ruolo('segreteria','incordatore'));

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
      if nullif(btrim(v_item -> 'racchetta' ->> 'identificazione'), '') is null then
        raise exception 'Indica come riconoscere la racchetta (colore, numero…)';
      end if;
      insert into public.racchette (cliente_id, marca, modello, identificazione, note)
      values (p_cliente_id,
              nullif(btrim(v_item -> 'racchetta' ->> 'marca'), ''),
              nullif(btrim(v_item -> 'racchetta' ->> 'modello'), ''),
              btrim(v_item -> 'racchetta' ->> 'identificazione'),
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


revoke execute on function public.crea_lavori(uuid, uuid, jsonb) from public, anon;
grant execute on function public.crea_lavori(uuid, uuid, jsonb) to authenticated;
