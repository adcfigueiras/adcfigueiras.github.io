import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import webpush from "npm:web-push@3.6.7";

// Respostas da fila são privadas; não permitir cache ou leitura cross-origin.
function secureJson(body: unknown, init: ResponseInit = {}): Response {
 const headers=new Headers(init.headers);
 headers.set("Cache-Control","no-store");
 headers.set("X-Content-Type-Options","nosniff");
 headers.set("Referrer-Policy","no-referrer");
 headers.set("Cross-Origin-Resource-Policy","same-site");
 return Response.json(body,{...init,headers});
}

function getAdminKey() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");

  if (raw) {
    try {
      const keys = JSON.parse(raw);

      if (
        typeof keys?.default === "string" &&
        keys.default
      ) {
        return keys.default;
      }

      const first = Object
        .values(keys || {})
        .find(
          (value) =>
            typeof value === "string" &&
            value
        );

      if (first) return first;
    } catch (error) {
      console.error(
        "Could not parse SUPABASE_SECRET_KEYS",
        error,
      );
    }
  }

  return (
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    ""
  );
}


const preferenceField = {
  callup: "callup_enabled",
  matchday: "matchday_enabled",
  training: "training_enabled",
  result: "result_enabled",
  nutrition: "nutrition_enabled",
  general: "general_enabled",
};


Deno.serve(async (req) => {

  if (req.method !== "POST") {
    return secureJson(
      { error: "Method not allowed" },
      { status: 405 },
    );
  }


  try {

    const expectedSecret =
      Deno.env.get("PUSH_QUEUE_SECRET") || "";

    const suppliedSecret =
      req.headers.get("x-push-queue-secret") || "";


    if (
      !expectedSecret ||
      suppliedSecret !== expectedSecret
    ) {
      return secureJson(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }


    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") || "";

    const adminKey = getAdminKey();

    const vapidPublic =
      Deno.env.get("VAPID_PUBLIC_KEY") || "";

    const vapidPrivate =
      Deno.env.get("VAPID_PRIVATE_KEY") || "";

    const vapidSubject =
      Deno.env.get("VAPID_SUBJECT") || "";


    if (
      !supabaseUrl ||
      !adminKey ||
      !vapidPublic ||
      !vapidPrivate ||
      !vapidSubject
    ) {
      throw new Error(
        "Server configuration is incomplete.",
      );
    }


    const admin = createClient(
      supabaseUrl,
      adminKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );


    webpush.setVapidDetails(
      vapidSubject,
      vapidPublic,
      vapidPrivate,
    );


    const nowIso = new Date().toISOString();


    // -----------------------------------------------------
    // NOTIFICAÇÕES QUE JÁ DEVEM SER ENVIADAS
    // -----------------------------------------------------

    const {
      data: notifications,
      error: notificationsError,
    } = await admin
      .from("notifications")
      .select(
        "id,type,title,body,scheduled_for,created_at",
      )
      .eq("push_enabled", true)
      .or(
        `scheduled_for.is.null,scheduled_for.lte.${nowIso}`,
      )
      .order("created_at", {
        ascending: true,
      })
      .limit(100);


    if (notificationsError) {
      throw notificationsError;
    }


    if (!notifications?.length) {
      return secureJson({
        processed: 0,
        sent_users: 0,
        sent_devices: 0,
        failed_users: 0,
      });
    }


    const notificationIds =
      notifications.map((row) => row.id);

    const notificationById =
      new Map(
        notifications.map(
          (row) => [row.id, row],
        ),
      );


    // -----------------------------------------------------
    // DESTINATÁRIOS AINDA SEM PUSH
    // -----------------------------------------------------

    const {
      data: recipients,
      error: recipientsError,
    } = await admin
      .from("notification_recipients")
      .select(
        "notification_id,user_id,push_sent_at,push_attempted_at,push_attempt_count,push_last_error",
      )
      .in(
        "notification_id",
        notificationIds,
      )
      .is("push_sent_at", null)
      .lt("push_attempt_count", 5)
      .limit(500);


    if (recipientsError) {
      throw recipientsError;
    }


    if (!recipients?.length) {
      return secureJson({
        processed: 0,
        sent_users: 0,
        sent_devices: 0,
        failed_users: 0,
      });
    }


    const userIds = [
      ...new Set(
        recipients.map(
          (row) => row.user_id,
        ),
      ),
    ];


    // -----------------------------------------------------
    // DISPOSITIVOS + PREFERÊNCIAS
    // -----------------------------------------------------

    const [
      {
        data: subscriptions,
        error: subscriptionsError,
      },
      {
        data: preferences,
        error: preferencesError,
      },
    ] = await Promise.all([

      admin
        .from("push_subscriptions")
        .select(
          "id,user_id,endpoint,p256dh,auth,active",
        )
        .in("user_id", userIds)
        .eq("active", true),

      admin
        .from("notification_preferences")
        .select(
          "user_id,callup_enabled,matchday_enabled,training_enabled,result_enabled,nutrition_enabled,general_enabled",
        )
        .in("user_id", userIds),

    ]);


    if (subscriptionsError) {
      throw subscriptionsError;
    }

    if (preferencesError) {
      throw preferencesError;
    }


    const subscriptionsByUser =
      new Map();

    for (
      const sub of subscriptions || []
    ) {

      const rows =
        subscriptionsByUser.get(
          sub.user_id,
        ) || [];

      rows.push(sub);

      subscriptionsByUser.set(
        sub.user_id,
        rows,
      );
    }


    const preferencesByUser =
      new Map(
        (preferences || []).map(
          (row) => [
            row.user_id,
            row,
          ],
        ),
      );


    let processed = 0;
    let sentUsers = 0;
    let sentDevices = 0;
    let failedUsers = 0;
    let skippedPreferences = 0;
    let noSubscription = 0;


    // -----------------------------------------------------
    // PROCESSAR FILA
    // -----------------------------------------------------

    for (
      const recipient of recipients
    ) {

      const note =
        notificationById.get(
          recipient.notification_id,
        );

      if (!note) continue;


      const previousAttempts =
        Number(
          recipient.push_attempt_count || 0,
        );

      const nextAttempts =
        previousAttempts + 1;

      const attemptTime =
        new Date().toISOString();


      // Pequeno lock otimista:
      // evita dois Cron enviarem o mesmo push.
      const {
        data: claimed,
        error: claimError,
      } = await admin
        .from("notification_recipients")
        .update({
          push_attempted_at:
            attemptTime,
          push_attempt_count:
            nextAttempts,
          push_last_error:
            null,
        })
        .eq(
          "notification_id",
          recipient.notification_id,
        )
        .eq(
          "user_id",
          recipient.user_id,
        )
        .eq(
          "push_attempt_count",
          previousAttempts,
        )
        .is("push_sent_at", null)
        .select(
          "notification_id,user_id",
        )
        .maybeSingle();


      if (claimError) {
        throw claimError;
      }

      if (!claimed) {
        continue;
      }


      processed++;


      // ---------------------------------------------------
      // RESPEITAR PREFERÊNCIAS ATUAIS
      // ---------------------------------------------------

      const prefs =
        preferencesByUser.get(
          recipient.user_id,
        ) || {};

      const prefKey =
        preferenceField[
          note.type
        ];


      if (
        prefKey &&
        prefs[prefKey] === false
      ) {

        skippedPreferences++;

        await admin
          .from(
            "notification_recipients",
          )
          .update({
            push_attempt_count: 5,
            push_last_error:
              "Desativado nas preferências do utilizador.",
          })
          .eq(
            "notification_id",
            recipient.notification_id,
          )
          .eq(
            "user_id",
            recipient.user_id,
          );

        continue;
      }


      const userSubscriptions =
        subscriptionsByUser.get(
          recipient.user_id,
        ) || [];


      // ---------------------------------------------------
      // SEM DISPOSITIVOS ATIVOS
      // ---------------------------------------------------

      if (
        !userSubscriptions.length
      ) {

        noSubscription++;

        await admin
          .from(
            "notification_recipients",
          )
          .update({
            push_attempt_count: 5,
            push_last_error:
              "Sem subscrição push ativa.",
          })
          .eq(
            "notification_id",
            recipient.notification_id,
          )
          .eq(
            "user_id",
            recipient.user_id,
          );

        continue;
      }


      const payload =
        JSON.stringify({
          title:
            note.title ||
            "ADC Figueiras",

          // Evitar que o peso e o plano individual surjam no ecrã bloqueado
          // ou sejam enviados em claro ao serviço de entrega push.
          // O conteúdo completo continua acessível só dentro da app autenticada.
          body:
            note.type === "nutrition"
              ? "O teu plano pré-jogo está disponível. Consulta as Notificações da app."
              : (note.body || "Tens uma nova notificação."),

          url: "./",

          tag:
            `adc-figueiras-${note.id}`,
        });


      let successfulDevices = 0;
      const errors = [];


      // ---------------------------------------------------
      // ENVIAR PARA TODOS OS DISPOSITIVOS DO UTILIZADOR
      // ---------------------------------------------------

      for (
        const sub
        of userSubscriptions
      ) {

        try {

          await webpush
            .sendNotification(
              {
                endpoint:
                  sub.endpoint,

                keys: {
                  p256dh:
                    sub.p256dh,

                  auth:
                    sub.auth,
                },
              },

              payload,

              {
                TTL: 86400,
              },
            );


          successfulDevices++;
          sentDevices++;


        } catch (error) {

          const statusCode =
            Number(
              error?.statusCode || 0,
            );

          const message =
            String(
              error?.message ||
              "Web Push error",
            );


          errors.push(
            `${statusCode || "?"}: ${message}`,
          );


          console.error(
            "Web Push error",
            note.id,
            recipient.user_id,
            sub.id,
            statusCode,
            message,
          );


          // Subscrição já eliminada/expirada.
          if (
            statusCode === 404 ||
            statusCode === 410
          ) {

            await admin
              .from(
                "push_subscriptions",
              )
              .delete()
              .eq(
                "id",
                sub.id,
              );
          }
        }
      }


      // ---------------------------------------------------
      // RESULTADO DA ENTREGA
      // ---------------------------------------------------

      if (
        successfulDevices > 0
      ) {

        sentUsers++;

        await admin
          .from(
            "notification_recipients",
          )
          .update({
            push_sent_at:
              new Date()
                .toISOString(),

            push_last_error:
              null,
          })
          .eq(
            "notification_id",
            recipient.notification_id,
          )
          .eq(
            "user_id",
            recipient.user_id,
          );

      } else {

        failedUsers++;

        await admin
          .from(
            "notification_recipients",
          )
          .update({
            push_last_error:
              errors
                .join(" | ")
                .slice(0, 2000)
              ||
              "Nenhum dispositivo aceitou o push.",
          })
          .eq(
            "notification_id",
            recipient.notification_id,
          )
          .eq(
            "user_id",
            recipient.user_id,
          );
      }
    }


    return secureJson({
      processed,
      sent_users: sentUsers,
      sent_devices: sentDevices,
      failed_users: failedUsers,
      skipped_preferences:
        skippedPreferences,
      no_subscription:
        noSubscription,
    });


  } catch (error) {

    console.error("Push queue request failed:",error instanceof Error?error.name:"Unknown");

    return secureJson(
      { error: "Não foi possível processar a fila de notificações." },
      { status: 500 },
    );
  }
});