-- AUDITORIA DE SEGURANÇA ADC FIGUEIRAS — limitador atómico por utilizador
-- PREPARAR EM PROJETO DE TESTE PRIMEIRO. NÃO executar diretamente em produção.
-- O Supabase Auth já limita login/signup/reset no próprio serviço:
-- confirmar quotas em Authentication > Rate Limits; isto protege endpoints próprios.

begin;

create table if not exists private.user_action_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action_name text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key(user_id, action_name)
);
alter table private.user_action_rate_limits enable row level security;
revoke all on private.user_action_rate_limits from public, anon, authenticated;

create or replace function private.claim_action_rate_limit(
  p_action text,
  p_window_seconds integer,
  p_max_requests integer
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
  v_now timestamptz := clock_timestamp();
begin
  -- Não aceitar IDs de outros utilizadores fornecidos pelo cliente.
  if v_user_id is null then return false; end if;
  if p_action not in ('push_test','member_request','profile_update','notification_create') then
    raise exception 'Ação inválida.';
  end if;
  if p_window_seconds < 10 or p_window_seconds > 86400
     or p_max_requests < 1 or p_max_requests > 200 then
    raise exception 'Limite inválido.';
  end if;

  insert into private.user_action_rate_limits as ratelimit
    (user_id,action_name,window_started_at,request_count)
  values (v_user_id,p_action,v_now,1)
  on conflict (user_id,action_name)
  do update set
    window_started_at = case
      when ratelimit.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        then v_now
      else ratelimit.window_started_at end,
    request_count = case
      when ratelimit.window_started_at <= v_now - make_interval(secs => p_window_seconds)
        then 1
      else ratelimit.request_count + 1 end
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$function$;

revoke all on function private.claim_action_rate_limit(text,integer,integer) from public,anon,authenticated;

-- Somente esta RPC com parâmetros fixos pode ser usada no browser.
-- O cliente não escolhe o utilizador nem o intervalo.
create or replace function public.claim_push_test_slot()
returns boolean
language plpgsql security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Sessão inválida.';
  end if;
  return private.claim_action_rate_limit('push_test',300,3);
end;
$function$;

revoke all on function public.claim_push_test_slot() from public,anon;
grant execute on function public.claim_push_test_slot() to authenticated;

commit;

-- Testes obrigatórios:
-- 1. Um usuário de teste pode obter 3 autorizações em 5 minutos; a 4.ª é false.
-- 2. Outra conta tem contador independente e não consegue ler/escrever a tabela.
-- 3. Anon não executa RPC. A contagem reseta passados 5 minutos.
-- 4. Testar concorrência (UPSERT atómico) e a Edge Function push-test.
-- 5. Definir limpeza de contadores antigos se necessário; janela de 5 min, 1 row/user.

-- CONTROLOS SERVIDOR ADICIONAIS (verificar compatibilidade das funções existentes)
-- As definições seguintes foram geradas a partir do código atual de produção,
-- preservando os controlos de identidade/função existentes e acrescentando limites.
begin;

-- Rate limit de create_notification preservando argumentos, defaults e autorização original.
CREATE OR REPLACE FUNCTION public.create_notification(p_type text, p_title text, p_body text, p_audience text, p_match_id uuid DEFAULT NULL::uuid, p_training_id uuid DEFAULT NULL::uuid, p_player_ids uuid[] DEFAULT NULL::uuid[], p_dedupe_key text DEFAULT NULL::text, p_scheduled_for timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(notification_id uuid, recipient_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_notification_id uuid;
    v_recipient_count integer := 0;
    v_dedupe_key text := nullif(trim(p_dedupe_key), '');
begin
    if not (
        private.has_role('admin')
        or private.has_role('staff')
    ) then
        raise exception 'Sem permissão para enviar notificações.';
    end if;

    if not private.claim_action_rate_limit('notification_create',3600,90) then
      raise exception 'Limite de notificações atingido. Aguarda antes de enviar novamente.';
    end if;

    if length(p_title) > 160 or length(p_body) > 8192 then
      raise exception 'Mensagem demasiado longa.';
    end if;

    if p_type not in ('callup','matchday','training','result','nutrition','general') then
        raise exception 'Tipo de notificação inválido.';
    end if;

    if p_audience not in ('all_registered','players_members','players','members','called_up','player_ids') then
        raise exception 'Destinatários inválidos.';
    end if;

    if trim(coalesce(p_title, '')) = '' then
        raise exception 'Título obrigatório.';
    end if;

    if trim(coalesce(p_body, '')) = '' then
        raise exception 'Mensagem obrigatória.';
    end if;

    if v_dedupe_key is not null then
        select n.id
        into v_notification_id
        from public.notifications n
        where n.dedupe_key = v_dedupe_key
        limit 1;
    end if;

    if v_notification_id is null then
        insert into public.notifications (
            type,title,body,match_id,training_id,scheduled_for,dedupe_key,created_by
        )
        values (
            p_type,trim(p_title),trim(p_body),p_match_id,p_training_id,p_scheduled_for,v_dedupe_key,auth.uid()
        )
        returning id into v_notification_id;
    else
        update public.notifications
        set
            type = p_type,
            title = trim(p_title),
            body = trim(p_body),
            match_id = p_match_id,
            training_id = p_training_id,
            scheduled_for = p_scheduled_for,
            created_by = auth.uid(),
            created_at = now(),
            updated_at = now()
        where id = v_notification_id;

        delete from public.notification_recipients nr
        where nr.notification_id = v_notification_id;
    end if;

    with candidates as (
        select distinct p.id as user_id
        from public.profiles p
        where
            p.active = true
            and (
                p_audience = 'all_registered'
                or (
                    p_audience = 'players_members'
                    and exists (
                        select 1
                        from public.user_roles ur
                        where ur.user_id = p.id
                          and ur.role in ('player','member')
                    )
                )
                or (
                    p_audience = 'players'
                    and exists (
                        select 1
                        from public.user_roles ur
                        where ur.user_id = p.id
                          and ur.role = 'player'
                    )
                )
                or (
                    p_audience = 'members'
                    and exists (
                        select 1
                        from public.user_roles ur
                        where ur.user_id = p.id
                          and ur.role = 'member'
                    )
                )
                or (
                    p_audience = 'called_up'
                    and p_match_id is not null
                    and exists (
                        select 1
                        from public.player_accounts pa
                        join public.match_players mp on mp.player_id = pa.player_id
                        where pa.user_id = p.id
                          and mp.match_id = p_match_id
                          and mp.called_up = true
                    )
                )
                or (
                    p_audience = 'player_ids'
                    and p_player_ids is not null
                    and exists (
                        select 1
                        from public.player_accounts pa
                        where pa.user_id = p.id
                          and pa.player_id = any(p_player_ids)
                    )
                )
            )
    ),
    eligible as (
        select c.user_id
        from candidates c
        left join public.notification_preferences np on np.user_id = c.user_id
        where
            case p_type
                when 'callup' then coalesce(np.callup_enabled, true)
                when 'matchday' then coalesce(np.matchday_enabled, true)
                when 'training' then coalesce(np.training_enabled, true)
                when 'result' then coalesce(np.result_enabled, true)
                when 'nutrition' then coalesce(np.nutrition_enabled, true)
                when 'general' then coalesce(np.general_enabled, true)
                else true
            end
    )
    insert into public.notification_recipients (notification_id,user_id)
    select v_notification_id,user_id
    from eligible
    on conflict do nothing;

    get diagnostics v_recipient_count = row_count;

    return query
    select v_notification_id,v_recipient_count;
end;
$function$;

-- Rate limit de request_member_number preservando argumentos, defaults e autorização original.
CREATE OR REPLACE FUNCTION public.request_member_number(p_member_number text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_user_id uuid := auth.uid();
    v_number text := nullif(trim(coalesce(p_member_number, '')), '');
    v_status text;
    v_is_member boolean;
begin

    if v_user_id is null then
        raise exception 'Sessão inválida.';
    end if;


    if not private.claim_action_rate_limit('member_request',3600,8) then
      raise exception 'Limite de pedidos de sócio atingido. Tenta mais tarde.';
    end if;

    select
        p.member_status
    into
        v_status
    from public.profiles p
    where p.id = v_user_id;


    if not found then
        raise exception 'Perfil não encontrado.';
    end if;


    select exists (
        select 1
        from public.user_roles ur
        where ur.user_id = v_user_id
          and ur.role = 'member'
    )
    into v_is_member;


    -- Um sócio já validado não pode alterar
    -- o número sem intervenção de um Admin.
    if v_status = 'verified' or v_is_member then
        raise exception
        'O teu número de sócio já foi validado. Contacta um Admin para o alterar.';
    end if;


    -- Permitir cancelar um pedido ainda pendente.
    if v_number is null then

        update public.profiles
        set
            member_number = null,
            member_status = 'none',
            updated_at = now()
        where id = v_user_id;

        return;

    end if;


    if length(v_number) > 30 then
        raise exception 'Número de sócio inválido.';
    end if;


    -- Nunca fica verified por ação do próprio utilizador.
    update public.profiles
    set
        member_number = v_number,
        member_status = 'pending',
        updated_at = now()
    where id = v_user_id;

end;
$function$;

-- Rate limit de update_my_profile preservando argumentos, defaults e autorização original.
CREATE OR REPLACE FUNCTION public.update_my_profile(p_display_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
    v_user_id uuid := auth.uid();
    v_name text := trim(coalesce(p_display_name, ''));
begin

    if v_user_id is null then
        raise exception 'Sessão inválida.';
    end if;

    if not private.claim_action_rate_limit('profile_update',3600,20) then
      raise exception 'Limite de alterações do perfil atingido. Tenta mais tarde.';
    end if;

    if v_name = '' then
        raise exception 'O nome é obrigatório.';
    end if;

    if length(v_name) > 120 then
        raise exception 'O nome é demasiado longo.';
    end if;

    update public.profiles
    set
        display_name = v_name,
        updated_at = now()
    where id = v_user_id;

    if not found then
        raise exception 'Perfil não encontrado.';
    end if;

end;
$function$;

commit;

-- Rever/testar num clone: pedidos de sócio 8/h, alterações de perfil 20/h,
-- criação de notificações 90/h, comprimento máx. título 160 e corpo 8192.
-- Esgotar limites com 2 utilizadores fictícios distintos e confirmar isolamento.
