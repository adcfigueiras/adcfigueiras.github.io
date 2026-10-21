-- ADC Figueiras: registo de aceitação dos Termos (MINUTA, NÃO APLICAR EM PRODUÇÃO SEM REVISÃO).
-- A confirmação é fornecida no registo de conta. O timestamp de receção é criado pelo servidor.
-- O evento não constitui consentimento explícito para pesagens, lesões ou imagens.
begin;

create table if not exists public.terms_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null default now(),
  method text not null default 'signup',
  primary key (user_id, version),
  constraint terms_version_nonempty check (length(trim(version)) > 0)
);

alter table public.terms_acceptances enable row level security;

drop policy if exists "Users read own terms acceptance" on public.terms_acceptances;
create policy "Users read own terms acceptance"
on public.terms_acceptances for select to authenticated
using (user_id = (select auth.uid()));

-- O cliente NÃO tem permissões de escrita nesta tabela.
revoke all on public.terms_acceptances from public, anon, authenticated;
grant select on public.terms_acceptances to authenticated;

create or replace function private.record_signup_terms_acceptance()
returns trigger
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_version text;
begin
  -- A criação de conta existente continua a funcionar para fluxos internos
  -- mesmo sem esta confirmação; o frontend público exige a checkbox.
  if coalesce(new.raw_user_meta_data ->> 'terms_accepted','') = 'true' then
    v_version := nullif(trim(coalesce(new.raw_user_meta_data ->> 'terms_version','')),'');
    if v_version is not null and length(v_version) <= 60 then
      insert into public.terms_acceptances(user_id,version,accepted_at,method)
      values (new.id,v_version,now(),'signup')
      on conflict (user_id,version) do nothing;
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function private.record_signup_terms_acceptance() from public, anon, authenticated;

drop trigger if exists trg_auth_signup_terms_acceptance on auth.users;
create trigger trg_auth_signup_terms_acceptance
after insert on auth.users for each row
execute function private.record_signup_terms_acceptance();

commit;

-- Testes antes de aplicar: registo novo normal, confirmação de email, contas por convite,
-- RLS usuário A/B e admin, recusa de escrita do cliente, ausência de registo em fluxos antigos.
-- Nota: metadata é enviada pelo cliente e não prova que uma pessoa tenha lido os termos.
-- Para prova robusta, guardar o texto/sha do documento vigente, IP quando justificável,
-- versão aprovada, carimbo de tempo do servidor e evidência mínima do UI; validar retenção RGPD.
