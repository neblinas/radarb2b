import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (
  !stripeSecretKey ||
  !stripeWebhookSecret ||
  !supabaseUrl ||
  !supabaseServiceRoleKey
) {
  throw new Error("Configuração do servidor incompleta.");
}

const supabase = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
);

const encoder = new TextEncoder();

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);

  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }

  return bytes;
}

function timingSafeEqual(
  a: Uint8Array,
  b: Uint8Array,
): boolean {
  if (a.length !== b.length) return false;

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}

async function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): Promise<boolean> {
  const parts = signatureHeader.split(",");

  let timestamp: string | null = null;
  const signatures: string[] = [];

  for (const part of parts) {
    const [key, value] = part.split("=");

    if (key === "t") {
      timestamp = value;
    }

    if (key === "v1") {
      signatures.push(value);
    }
  }

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const timestampNumber = Number(timestamp);

  if (!Number.isFinite(timestampNumber)) {
    return false;
  }

  // Rejeita assinaturas com mais de 5 minutos.
  const now = Math.floor(Date.now() / 1000);

  if (Math.abs(now - timestampNumber) > 300) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    {
      name: "HMAC",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const expectedSignatureBuffer =
    await crypto.subtle.sign(
      "HMAC",
      cryptoKey,
      encoder.encode(signedPayload),
    );

  const expectedSignature = new Uint8Array(
    expectedSignatureBuffer,
  );

  for (const signature of signatures) {
    try {
      const receivedSignature =
        hexToBytes(signature);

      if (
        timingSafeEqual(
          expectedSignature,
          receivedSignature,
        )
      ) {
        return true;
      }
    } catch {
      // Ignora assinaturas inválidas.
    }
  }

  return false;
}

function stripeTimestampToIso(
  timestamp: number | null | undefined,
): string | null {
  if (!timestamp) return null;

  return new Date(timestamp * 1000).toISOString();
}

async function getSubscriptionFromStripe(
  subscriptionId: string,
) {
  const response = await fetch(
    `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
    {
      headers: {
        Authorization:
          `Bearer ${stripeSecretKey}`,
      },
    },
  );

  const subscription = await response.json();

  if (!response.ok) {
    throw new Error(
      subscription?.error?.message ??
        "Não foi possível obter a subscrição Stripe.",
    );
  }

  return subscription;
}

// Dispara o motor de comissões para o cliente da subscrição sincronizada.
// É best-effort: uma falha aqui não deve fazer o webhook Stripe falhar (a
// subscrição local já foi atualizada e o gestor pode reprocessar).
async function syncCommissions(params: {
  clientUserId: string;
  isCancelled: boolean;
}) {
  const { clientUserId, isCancelled } = params;

  try {
    if (isCancelled) {
      const { data: subs, error: subsError } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", clientUserId);

      if (subsError) throw subsError;

      for (const sub of subs ?? []) {
        await supabase.rpc("commission_sync_subscription_service", {
          p_subscription_id: sub.id,
          p_paid_months: null,
          p_is_annual: null,
          p_is_cancelled: true,
        });
      }
      return;
    }

    // Recalcula as comissões das subscrições ativas do cliente. O motor infere
    // os meses pagos a partir do período de faturação atual.
    await supabase.rpc("commission_resync_client", {
      p_client_user_id: clientUserId,
    });
  } catch (commissionError) {
    console.error(
      "Falha ao sincronizar comissões:",
      commissionError,
    );
  }
}


async function findPlanIdByPriceId(
  priceId: string | null,
): Promise<string | null> {
  if (!priceId) return null;

  const { data, error } = await supabase
    .from("plans")
    .select("id")
    .or(
      `stripe_price_id.eq.${priceId},stripe_price_id_annual.eq.${priceId}`,
    )
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

async function syncSubscription(
  stripeSubscription: any,
  fallbackUserId?: string | null,
  fallbackPlanId?: string | null,
) {
  const stripeSubscriptionId =
    stripeSubscription?.id ?? null;

  const stripeCustomerId =
    typeof stripeSubscription?.customer ===
        "string"
      ? stripeSubscription.customer
      : stripeSubscription?.customer?.id ??
        null;

  const priceId =
    stripeSubscription?.items?.data?.[0]
      ?.price?.id ?? null;

  const metadataUserId =
    stripeSubscription?.metadata
      ?.supabase_user_id ??
    fallbackUserId ??
    null;

  const metadataPlanId =
    stripeSubscription?.metadata?.plan_id ??
    fallbackPlanId ??
    null;

  const mappedPlanId =
    await findPlanIdByPriceId(priceId);

  const planId =
    mappedPlanId ??
    metadataPlanId ??
    "free";

  const stripeStatus =
    stripeSubscription?.status ?? null;

  let localStatus = "expired";

  if (
    stripeStatus === "active" ||
    stripeStatus === "trialing"
  ) {
    localStatus = stripeStatus;
  } else if (
    stripeStatus === "past_due" ||
    stripeStatus === "unpaid"
  ) {
    localStatus = "past_due";
  } else if (
    stripeStatus === "canceled"
  ) {
    localStatus = "cancelled";
  }

  let userId = metadataUserId;

  if (!userId && stripeCustomerId) {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq(
        "stripe_customer_id",
        stripeCustomerId,
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    userId = data?.user_id ?? null;
  }

  if (!userId) {
    throw new Error(
      "Não foi possível identificar o utilizador da subscrição.",
    );
  }

  const updateData: Record<
    string,
    unknown
  > = {
    plan_id:
      localStatus === "cancelled" ||
        localStatus === "expired"
        ? "free"
        : planId,

    status:
      localStatus === "cancelled"
        ? "active"
        : localStatus,

    stripe_customer_id: stripeCustomerId,

    stripe_subscription_id:
      stripeSubscriptionId,

    stripe_price_id: priceId,

    cancel_at_period_end:
      Boolean(
        stripeSubscription
          ?.cancel_at_period_end,
      ) ||
      (
        stripeSubscription?.status !== "canceled" &&
        stripeSubscription?.cancel_at != null &&
        Number(stripeSubscription.cancel_at) >
          Math.floor(Date.now() / 1000)
      ),

    current_period_start:
      stripeTimestampToIso(
        stripeSubscription
          ?.items?.data?.[0]
          ?.current_period_start,
      ),

    current_period_end:
      stripeTimestampToIso(
        stripeSubscription
          ?.items?.data?.[0]
          ?.current_period_end,
      ),

    updated_at: new Date().toISOString(),
  };

  if (
    localStatus === "cancelled" ||
    localStatus === "expired"
  ) {
    updateData.stripe_subscription_id =
      null;

    updateData.stripe_price_id = null;

    updateData.cancel_at_period_end =
      false;

    updateData.current_period_start =
      null;

    updateData.current_period_end =
      null;
  }

  const { error: updateError } =
    await supabase
      .from("subscriptions")
      .update(updateData)
      .eq("user_id", userId);

  if (updateError) {
    throw updateError;
  }

  return { userId, localStatus };
}

async function registerStripeEvent(
  eventId: string,
  eventType: string,
): Promise<"process" | "duplicate"> {
  const { error: insertError } =
    await supabase
      .from("stripe_webhook_events")
      .insert({
        event_id: eventId,
        event_type: eventType,
        status: "processing",
      });

  if (!insertError) {
    return "process";
  }

  // PostgreSQL unique violation.
  if (insertError.code !== "23505") {
    throw insertError;
  }

  const { data, error } = await supabase
    .from("stripe_webhook_events")
    .select("status")
    .eq("event_id", eventId)
    .single();

  if (error) {
    throw error;
  }

  // Já concluído ou está a ser processado
  // por outra invocação.
  if (
    data.status === "processed" ||
    data.status === "processing"
  ) {
    return "duplicate";
  }

  // Se falhou anteriormente, permite retry.
  const { error: retryError } =
    await supabase
      .from("stripe_webhook_events")
      .update({
        status: "processing",
        error_message: null,
        processed_at: null,
      })
      .eq("event_id", eventId);

  if (retryError) {
    throw retryError;
  }

  return "process";
}

async function markEventProcessed(
  eventId: string,
) {
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      status: "processed",
      processed_at:
        new Date().toISOString(),
      error_message: null,
    })
    .eq("event_id", eventId);

  if (error) {
    throw error;
  }
}

async function markEventError(
  eventId: string,
  message: string,
) {
  const { error } = await supabase
    .from("stripe_webhook_events")
    .update({
      status: "error",
      error_message: message.slice(0, 2000),
    })
    .eq("event_id", eventId);

  if (error) {
    console.error(
      "Erro ao registar falha do webhook:",
      error,
    );
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      "Method not allowed",
      { status: 405 },
    );
  }

  let eventId: string | null = null;

  try {
    const signature =
      req.headers.get("stripe-signature");

    if (!signature) {
      return new Response(
        "Missing Stripe signature",
        { status: 400 },
      );
    }

    const rawBody = await req.text();

    const validSignature =
      await verifyStripeSignature(
        rawBody,
        signature,
        stripeWebhookSecret,
      );

    if (!validSignature) {
      return new Response(
        "Invalid Stripe signature",
        { status: 400 },
      );
    }

    const event = JSON.parse(rawBody);

    eventId = event?.id ?? null;

    if (
      !eventId ||
      typeof eventId !== "string" ||
      !event?.type
    ) {
      return new Response(
        "Invalid Stripe event",
        { status: 400 },
      );
    }

    const registration =
      await registerStripeEvent(
        eventId,
        event.type,
      );

    if (registration === "duplicate") {
      return new Response(
        JSON.stringify({
          received: true,
          duplicate: true,
        }),
        {
          status: 200,
          headers: {
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;

        const subscriptionId =
          typeof session.subscription ===
              "string"
            ? session.subscription
            : session.subscription?.id;

        if (subscriptionId) {
          const stripeSubscription =
            await getSubscriptionFromStripe(
              subscriptionId,
            );

          const syncResult = await syncSubscription(
            stripeSubscription,
            session.metadata
              ?.supabase_user_id ?? null,
            session.metadata?.plan_id ??
              null,
          );

          await syncCommissions({
            clientUserId: syncResult.userId,
            isCancelled:
              syncResult.localStatus ===
              "cancelled",
          });
        }

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const eventSubscription =
          event.data.object;

        const subscriptionId =
          eventSubscription?.id;

        if (!subscriptionId) {
          throw new Error(
            "Evento Stripe sem ID de subscrição.",
          );
        }

        const stripeSubscription =
          await getSubscriptionFromStripe(
            subscriptionId,
          );

        const syncResult = await syncSubscription(
          stripeSubscription,
          eventSubscription?.metadata
            ?.supabase_user_id ?? null,
          eventSubscription?.metadata?.plan_id ??
            null,
        );

        await syncCommissions({
          clientUserId: syncResult.userId,
          isCancelled:
            syncResult.localStatus ===
            "cancelled",
        });

        break;
      }

      case "customer.subscription.deleted": {
        const syncResult = await syncSubscription(
          event.data.object,
        );

        await syncCommissions({
          clientUserId: syncResult.userId,
          isCancelled: true,
        });

        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object;

        const subscriptionId =
          typeof invoice.subscription ===
              "string"
            ? invoice.subscription
            : invoice.subscription?.id;

        if (subscriptionId) {
          const stripeSubscription =
            await getSubscriptionFromStripe(
              subscriptionId,
            );

          const syncResult = await syncSubscription(
            stripeSubscription,
          );

          await syncCommissions({
            clientUserId: syncResult.userId,
            isCancelled:
              syncResult.localStatus ===
              "cancelled",
          });
        }

        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;

        const subscriptionId =
          typeof invoice.subscription ===
              "string"
            ? invoice.subscription
            : invoice.subscription?.id;

        if (subscriptionId) {
          const stripeSubscription =
            await getSubscriptionFromStripe(
              subscriptionId,
            );

          await syncSubscription(
            stripeSubscription,
          );

          // Pagamento falhado: não gera comissões novas.
        }

        break;
      }

      default:
        break;
    }

    await markEventProcessed(eventId);

    return new Response(
      JSON.stringify({
        received: true,
        duplicate: false,
      }),
      {
        status: 200,
        headers: {
          "Content-Type":
            "application/json",
        },
      },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro interno.";

    console.error(error);

    if (eventId) {
      await markEventError(
        eventId,
        message,
      );
    }

    return new Response(
      JSON.stringify({
        error: message,
      }),
      {
        status: 500,
        headers: {
          "Content-Type":
            "application/json",
        },
      },
    );
  }
});