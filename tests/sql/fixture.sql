-- Esquema MÍNIMO e inteiramente FICTÍCIO para smoke tests PostgreSQL 17.
-- Não é cópia da base de dados de produção; apenas interfaces utilizadas
-- pelas quatro migrações pendentes. Não contém dados reais ou credenciais.

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE SCHEMA private;
GRANT USAGE ON SCHEMA auth,private,public TO anon,authenticated;

CREATE TABLE auth.users (
 id uuid PRIMARY KEY,
 raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;

CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id),
 display_name text,
 email text,
 member_number text,
 member_status text NOT NULL DEFAULT 'none',
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_roles (
 user_id uuid NOT NULL REFERENCES auth.users(id),
 role text NOT NULL,
 PRIMARY KEY (user_id,role)
);
CREATE TABLE public.player_accounts (
 user_id uuid NOT NULL REFERENCES auth.users(id),
 player_id uuid NOT NULL,
 PRIMARY KEY (user_id,player_id)
);
CREATE TABLE public.matches (
 id uuid PRIMARY KEY,
 status text NOT NULL,
 callup_published_at timestamptz
);
-- A coluna publicada ainda não existe em produção, removê-la aqui para
-- que a migração a acrescente como faria no sistema real.
ALTER TABLE public.matches DROP COLUMN callup_published_at;
CREATE TABLE public.match_players (
 match_id uuid NOT NULL REFERENCES public.matches(id),
 player_id uuid NOT NULL,
 called_up boolean NOT NULL DEFAULT false,
 played boolean NOT NULL DEFAULT false,
 started boolean NOT NULL DEFAULT false,
 PRIMARY KEY (match_id,player_id)
);
CREATE TABLE public.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 type text NOT NULL,
 title text NOT NULL,
 body text NOT NULL,
 match_id uuid REFERENCES public.matches(id),
 training_id uuid,
 scheduled_for timestamptz,
 dedupe_key text UNIQUE,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.notification_recipients (
 notification_id uuid NOT NULL REFERENCES public.notifications(id),
 user_id uuid NOT NULL REFERENCES auth.users(id),
 PRIMARY KEY(notification_id,user_id)
);
CREATE TABLE public.notification_preferences (
 user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 callup_enabled boolean NOT NULL DEFAULT true,
 matchday_enabled boolean NOT NULL DEFAULT true,
 training_enabled boolean NOT NULL DEFAULT true,
 result_enabled boolean NOT NULL DEFAULT true,
 nutrition_enabled boolean NOT NULL DEFAULT true,
 general_enabled boolean NOT NULL DEFAULT true
);

CREATE OR REPLACE FUNCTION private.has_role(p_role text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $$
 SELECT exists(
   SELECT 1 FROM public.user_roles
   WHERE user_id=auth.uid() AND role=p_role
 )
$$;
REVOKE ALL ON FUNCTION private.has_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(text) TO authenticated;

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read matches" ON public.matches
 FOR SELECT TO anon,authenticated USING (true);
CREATE POLICY "Public can read completed match players" ON public.match_players
 FOR SELECT TO anon,authenticated USING (
 EXISTS (SELECT 1 FROM public.matches m WHERE m.id=match_id AND m.status='completed')
 );
CREATE POLICY "Staff access all match players" ON public.match_players
 FOR SELECT TO authenticated USING (
 (SELECT private.has_role('admin')) OR (SELECT private.has_role('staff'))
 );
GRANT SELECT ON public.matches,public.match_players TO anon,authenticated;
GRANT SELECT ON public.profiles TO authenticated;

-- A produção concede a cada conta SELECT das suas notificações.
-- Reproduzir a política de leitura, sem abrir a tabela publicamente.
ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own notification recipients"
 ON public.notification_recipients FOR SELECT TO authenticated
 USING (user_id = (SELECT auth.uid()));
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read received notifications"
 ON public.notifications FOR SELECT TO authenticated
 USING (EXISTS (
   SELECT 1 FROM public.notification_recipients nr
   WHERE nr.notification_id=notifications.id AND nr.user_id=(SELECT auth.uid())
 ));
GRANT SELECT ON public.notification_recipients,public.notifications TO authenticated;

-- Notificação e RPC são proprietárias do servidor, não do cliente.
-- O esqueleto acima expõe apenas as colunas usadas pela função real
-- create_notification incorporada na migração de rate limit.
