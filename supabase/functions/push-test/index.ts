import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";

// Endpoint autenticado; nunca aceitar origens arbitrárias.
const ALLOWED_ORIGINS = new Set(["https://adcfigueiras.github.io"]);
function responseHeaders(origin: string | null): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
  });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Access-Control-Max-Age", "600");
  }
  return headers;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  const corsHeaders = responseHeaders(origin);
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return Response.json({ error: "Origem não autorizada." }, { status: 403, headers: corsHeaders });
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return Response.json({ error: "Método não permitido." }, { status: 405, headers: corsHeaders });
  }

  try {
    const authorization = req.headers.get("Authorization");

    if (!authorization) {
      return Response.json(
        { error: "Sessão em falta." },
        { status: 401, headers: corsHeaders },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
    const vapidSubject = Deno.env.get("VAPID_SUBJECT");

    if (
      !supabaseUrl ||
      !anonKey ||
      !vapidPublic ||
      !vapidPrivate ||
      !vapidSubject
    ) {
      throw new Error("Configuração do servidor incompleta.");
    }

    const supabase = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: authorization,
          },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return Response.json(
        { error: "Sessão inválida." },
        { status: 401, headers: corsHeaders },
      );
    }

    // Limitação real no servidor: até 3 testes por conta a cada 5 minutos.
    // A RPC é instalada por SUPABASE_MIGRATION_SECURITY_RATE_LIMIT.sql.
    const { data: slotGranted, error: slotError } = await supabase.rpc("claim_push_test_slot");
    if (slotError) throw new Error("A limitação de pedidos ainda não está configurada.");
    if (slotGranted !== true) {
      return Response.json(
        { error: "Limite de testes atingido. Tenta novamente daqui a alguns minutos." },
        { status: 429, headers: corsHeaders },
      );
    }

    const { data: subscriptions, error: subscriptionError } =
      await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth")
        .eq("user_id", user.id)
        .eq("active", true);

    if (subscriptionError) {
      throw subscriptionError;
    }

    if (!subscriptions?.length) {
      return Response.json(
        {
          sent: 0,
          message: "Não existem dispositivos com push ativo.",
        },
        { headers: corsHeaders },
      );
    }

    webpush.setVapidDetails(
      vapidSubject,
      vapidPublic,
      vapidPrivate,
    );

    const payload = JSON.stringify({
      title: "ADC Figueiras",
      body: "Push ativado com sucesso neste dispositivo.",
      url: "./",
      tag: "adc-figueiras-push-test",
    });

    let sent = 0;
    let failed = 0;

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
          {
            TTL: 60,
          },
        );

        sent++;
      } catch (error) {
        failed++;

        console.error(
          "Web Push error:",
          error?.statusCode,
          error?.message,
        );

        // Subscrições expiradas ou removidas pelo browser.
        if (
          error?.statusCode === 404 ||
          error?.statusCode === 410
        ) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("id", subscription.id);
        }
      }
    }

    return Response.json(
      {
        sent,
        failed,
        message:
          sent > 0
            ? "Push enviado."
            : "Nenhum push foi entregue.",
      },
      { headers: corsHeaders },
    );
  } catch (error) {
    // Não devolver detalhes internos do Supabase/VAPID para o browser.
    console.error("Push-test falhou:", error instanceof Error ? error.name : "unknown");

    return Response.json(
      { error: "Não foi possível concluir o teste. Tenta novamente mais tarde." },
      { status: 500, headers: corsHeaders },
    );
  }
});