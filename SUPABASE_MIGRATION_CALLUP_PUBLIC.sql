-- ADC Figueiras — divulgação pública automática da convocatória
-- Preparado para a próxima versão. NÃO aplicar no Supabase até à validação e publicação.
-- Não altera registos de pesagens, presenças ou notificações existentes.

begin;

alter table public.matches
  add column if not exists callup_published_at timestamptz;

-- A ficha pública pode consultar apenas os jogadores efetivamente convocados
-- num jogo agendado depois da publicação da convocatória no backend.
-- Os registos de não convocados permanecem reservados à equipa interna.
-- A política anterior para jogos concluídos mantém-se.
drop policy if exists "Public can read published match players" on public.match_players;
create policy "Public can read published match players"
on public.match_players for select
to anon, authenticated
using (
  exists (
    select 1 from public.matches m
    where m.id = match_players.match_id
      and m.callup_published_at is not null
      and match_players.called_up is true
  )
);

-- Uma única publicação por jogo: lock transacional e timestamp permanente.
-- A função existente create_notification respeita callup_enabled.
-- A notificação INDIVIDUAL existente para jogadores convocados mantém-se separada.
-- A mensagem geral é enviada a todos os elegíveis (incluindo jogadores).
create or replace function public.publish_match_callup(p_match_id uuid)
returns table(published boolean, notification_id uuid, recipient_count integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_published_at timestamptz;
  v_status text;
  v_note_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null or not (
    private.has_role('admin') or private.has_role('staff')
  ) then
    raise exception 'Sem permissão para publicar a convocatória.';
  end if;

  if p_match_id is null then
    raise exception 'Jogo inválido.';
  end if;

  select m.callup_published_at, m.status
    into v_published_at, v_status
  from public.matches m
  where m.id = p_match_id
  for update;

  if not found then
    raise exception 'Jogo não encontrado.';
  end if;

  -- Não publicar automaticamente jogos concluídos ou anulados.
  if v_status <> 'scheduled' or v_published_at is not null then
    return query select false, null::uuid, 0;
    return;
  end if;

  if not exists (
    select 1 from public.match_players mp
    where mp.match_id = p_match_id and mp.called_up = true
  ) then
    return query select false, null::uuid, 0;
    return;
  end if;

  update public.matches
  set callup_published_at = now()
  where id = p_match_id;

  select n.notification_id, n.recipient_count
    into v_note_id, v_count
  from public.create_notification(
    p_type => 'callup',
    p_title => 'CONVOCATÓRIA DISPONÍVEL',
    p_body => 'A convocatória para o próximo jogo já está disponível! Consulta o Match Center.',
    p_audience => 'all_registered',
    p_match_id => p_match_id,
    p_dedupe_key => 'callup_public:' || p_match_id::text,
    p_scheduled_for => null
  ) n;

  -- A mensagem geral chega a todos os utilizadores elegíveis que tenham
  -- a preferência Convocatórias ativa. A notificação individual já existente
  -- mantém-se independente e continua disponível para os convocados.
  -- A chave dedupe_key impede nova mensagem geral ao reeditar o jogo.
  return query select true, v_note_id, coalesce(v_count, 0);
end;
$function$;

revoke all on function public.publish_match_callup(uuid) from public, anon;
grant execute on function public.publish_match_callup(uuid) to authenticated;

commit;

-- Testar na publicação: público/sócio antes/depois de publicar, privacidade
-- das pesagens (match_weigh_ins, weigh_ins), callup_enabled=false,
-- não reenviar ao editar e push/caixa de notificações.
