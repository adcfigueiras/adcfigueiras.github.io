-- Execução apenas num Postgres temporário com tests/sql/fixture.sql.
-- Se qualquer propriedade falhar, lança exceção e faz falhar o GitHub Actions.

INSERT INTO auth.users(id,raw_user_meta_data) VALUES
 ('11111111-1111-4111-8111-111111111111','{}'),
 ('22222222-2222-4222-8222-222222222222','{}'),
 ('33333333-3333-4333-8333-333333333333','{"terms_accepted":true,"terms_version":"2026-10-21-v1"}');
INSERT INTO public.profiles(id,display_name,active) VALUES
 ('11111111-1111-4111-8111-111111111111','Admin Fictício',true),
 ('22222222-2222-4222-8222-222222222222','Atleta Fictício',true),
 ('33333333-3333-4333-8333-333333333333','Sócio Fictício',true);
INSERT INTO public.user_roles(user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','admin'),
 ('22222222-2222-4222-8222-222222222222','player'),
 ('33333333-3333-4333-8333-333333333333','member');
INSERT INTO public.notification_preferences(user_id,callup_enabled)
VALUES ('33333333-3333-4333-8333-333333333333',false);
INSERT INTO public.matches(id,status)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','scheduled');
INSERT INTO public.match_players(match_id,player_id,called_up)
VALUES
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','cccccccc-cccc-4ccc-8ccc-cccccccccccc',false);

DO $test$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.terms_acceptances
 WHERE user_id='33333333-3333-4333-8333-333333333333' AND version='2026-10-21-v1';
 IF n<>1 THEN RAISE EXCEPTION 'O trigger de aceitação dos Termos não guardou o registo.'; END IF;
 IF has_table_privilege('anon','public.terms_acceptances','SELECT')
 THEN RAISE EXCEPTION 'Anon não deveria ter SELECT nos Termos.'; END IF;
 IF has_table_privilege('authenticated','public.terms_acceptances','INSERT')
 THEN RAISE EXCEPTION 'A tabela dos Termos aceita escrita direta do cliente.'; END IF;
 IF has_table_privilege('anon','public.nutrition_settings','SELECT')
 THEN RAISE EXCEPTION 'A tabela do plano alimentar ficou pública.'; END IF;
 IF has_function_privilege('anon','public.claim_push_test_slot()','EXECUTE')
 THEN RAISE EXCEPTION 'RPC do rate limit aberta a visitantes.'; END IF;
 IF has_function_privilege('authenticated','private.claim_action_rate_limit(text,integer,integer)','EXECUTE')
 THEN RAISE EXCEPTION 'Rate limit interno ficou exposto.'; END IF;
END
$test$;

SET ROLE anon;
DO $test$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.match_players;
 IF n<>0 THEN RAISE EXCEPTION 'Convocatória agendada exposta antes de publicar.'; END IF;
END
$test$;
RESET ROLE;

-- Sócio autenticado não pode consultar pesos nem os termos de outras pessoas.
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SET ROLE authenticated;
DO $test$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.match_players;
 IF n<>0 THEN RAISE EXCEPTION 'Sócio viu convocatória antes da publicação.'; END IF;
 SELECT count(*) INTO n FROM public.nutrition_settings;
 IF n<>0 THEN RAISE EXCEPTION 'Sócio viu o plano privado da equipa técnica.'; END IF;
 SELECT count(*) INTO n FROM public.terms_acceptances;
 IF n<>1 THEN RAISE EXCEPTION 'Sócio não consegue ler a própria aceitação.'; END IF;
END
$test$;
RESET ROLE;

-- Admin cria pela primeira vez a convocatória e envia notificação.
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SET ROLE authenticated;
DO $test$
DECLARE result record;
DECLARE n integer;
DECLARE allowed boolean;
BEGIN
 SELECT * INTO result FROM public.publish_match_callup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF result.published IS DISTINCT FROM true THEN
   RAISE EXCEPTION 'Primeira publicação da convocatória não foi aceite.';
 END IF;
 IF result.recipient_count<>2 THEN
   RAISE EXCEPTION 'Preferências de notificação ignoradas: % destinatários.',result.recipient_count;
 END IF;
 SELECT count(*) INTO n FROM public.notifications;
 IF n<>1 THEN RAISE EXCEPTION 'Notificação geral não foi criada.'; END IF;
 SELECT * INTO result FROM public.publish_match_callup('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 IF result.published IS DISTINCT FROM false THEN
   RAISE EXCEPTION 'Publicação repetida deveria ser recusada.';
 END IF;
 SELECT count(*) INTO n FROM public.notifications;
 IF n<>1 THEN RAISE EXCEPTION 'Notificação duplicada após nova gravação.'; END IF;
 SELECT count(*) INTO n FROM public.nutrition_settings;
 IF n<>1 THEN RAISE EXCEPTION 'Admin não consegue consultar configuração de nutrição.'; END IF;
 UPDATE public.nutrition_settings SET nutrition_template='Mensagem fictícia',updated_at=now()
 WHERE id=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Admin não consegue guardar o plano fictício.'; END IF;

 -- Três testes em cinco minutos por conta. O quarto é bloqueado.
 FOR n IN 1..4 LOOP
   SELECT public.claim_push_test_slot() INTO allowed;
   IF (n<=3 AND allowed IS DISTINCT FROM true)
     OR (n=4 AND allowed IS DISTINCT FROM false)
   THEN RAISE EXCEPTION 'Limite push-test incorreto na tentativa %',n; END IF;
 END LOOP;
END
$test$;
RESET ROLE;

-- Público agora vê SOMENTE o convocado, não os registos dos não convocados.
SET ROLE anon;
DO $test$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.match_players;
 IF n<>1 THEN RAISE EXCEPTION 'Público viu % registos; esperado apenas um convocado.',n; END IF;
END
$test$;
RESET ROLE;

-- Atualizar estado do jogo para concluído preserva acesso a ambos, como antes.
UPDATE public.matches SET status='completed'
WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
SET ROLE anon;
DO $test$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM public.match_players;
 IF n<>2 THEN RAISE EXCEPTION 'Após o jogo, faltam estatísticas públicas de jogadores.'; END IF;
END
$test$;
RESET ROLE;

\echo 'Testes SQL do esquema mínimo: OK (convocatória, RLS, termos, nutrição, rate limit, notificações).'
