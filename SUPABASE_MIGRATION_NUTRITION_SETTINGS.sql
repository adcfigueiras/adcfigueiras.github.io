-- ADC Figueiras — configuração do plano alimentar pré-jogo
-- MINUTA / AMBIENTE DE TESTE: não aplicar diretamente na base de dados de produção.
-- Substitui o armazenamento persistente local de templates internos por registo no backend.
-- Requer exportar / preservar o template existente ANTES de publicar a app revista.

begin;

create table if not exists public.nutrition_settings (
  id boolean primary key default true check (id is true),
  weight_reference text not null default 'pre'
    check (weight_reference in ('pre','post','mean')),
  nutrition_template text not null default '',
  nutrition_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.nutrition_settings(id,weight_reference,nutrition_template,nutrition_enabled)
values (true,'pre','',false)
on conflict (id) do nothing;

alter table public.nutrition_settings enable row level security;

drop policy if exists "Staff and admins read nutrition settings"
on public.nutrition_settings;
create policy "Staff and admins read nutrition settings"
on public.nutrition_settings for select
to authenticated
using ((select private.has_role('admin')) or (select private.has_role('staff')));

drop policy if exists "Staff and admins update nutrition settings"
on public.nutrition_settings;
create policy "Staff and admins update nutrition settings"
on public.nutrition_settings for update
to authenticated
using ((select private.has_role('admin')) or (select private.has_role('staff')))
with check ((select private.has_role('admin')) or (select private.has_role('staff')));

-- A linha singleton é criada exclusivamente pela migração.
revoke all on public.nutrition_settings from public, anon, authenticated;
grant select, update on public.nutrition_settings to authenticated;

commit;

-- Verificar em ambiente de teste:
-- 1. Anon, member, player e captain não têm acesso ao template via API.
-- 2. Staff e admin conseguem ler e atualizar a configuração; outros não.
-- 3. Novo login de staff recupera o plano guardado por admin.
-- 4. Ecrã de plano alimentar e envio individual de push mantêm-se funcionais.
-- 5. Antes da publicação, arquivar o conteúdo do template guardado localmente
--    na versão atual e recolocá-lo na nova interface depois da migração.
