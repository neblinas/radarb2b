import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");

    if (
      !supabaseUrl ||
      !supabaseAnonKey ||
      !supabaseServiceRoleKey ||
      !stripeSecretKey
    ) {
      throw new Error("Configuração do servidor incompleta.");
    }

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Utilizador não autenticado." }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const supabaseUser = createClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await supabaseUser.auth.getUser();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Utilizador não autenticado." }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const body = await req.json().catch(() => ({}));
    const planId = body?.plan_id;
    const billing = body?.billing === "annual" ? "annual" : "monthly";

    if (!["starter", "pro"].includes(planId)) {
      return new Response(
        JSON.stringify({ error: "Plano inválido." }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        },
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
    );

    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("id, stripe_price_id, stripe_price_id_annual")
      .eq("id", planId)
      .single();

    if (planError || !plan) {
      throw new Error("Preço Stripe do plano não encontrado.");
    }

    const stripePriceId =
      billing === "annual"
        ? plan.stripe_price_id_annual
        : plan.stripe_price_id;

    if (!stripePriceId) {
      throw new Error(
        billing === "annual"
          ? "Preço anual do plano ainda não está configurado."
          : "Preço Stripe do plano não encontrado.",
      );
    }

    const { data: subscription, error: subscriptionError } =
      await supabaseAdmin
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .single();

    if (subscriptionError) {
      throw new Error("Subscrição do utilizador não encontrada.");
    }

    let stripeCustomerId = subscription.stripe_customer_id;

    if (!stripeCustomerId) {
      const customerParams = new URLSearchParams();

      if (user.email) {
        customerParams.set("email", user.email);
      }

      customerParams.set("metadata[supabase_user_id]", user.id);

      const customerResponse = await fetch(
        "https://api.stripe.com/v1/customers",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: customerParams,
        },
      );

      const customer = await customerResponse.json();

      if (!customerResponse.ok) {
        throw new Error(
          customer?.error?.message ??
            "Não foi possível criar o cliente Stripe.",
        );
      }

      stripeCustomerId = customer.id;

      const { error: updateError } = await supabaseAdmin
        .from("subscriptions")
        .update({
          stripe_customer_id: stripeCustomerId,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      if (updateError) {
        throw new Error(
          "Não foi possível associar o cliente Stripe ao utilizador.",
        );
      }
    }

    const origin =
      req.headers.get("origin") ??
      "http://localhost:3000";

    const checkoutParams = new URLSearchParams();

    checkoutParams.set("mode", "subscription");
    checkoutParams.set("customer", stripeCustomerId);
    checkoutParams.set("line_items[0][price]", stripePriceId);
    checkoutParams.set("line_items[0][quantity]", "1");

    checkoutParams.set(
      "success_url",
      `${origin}/conta?checkout=success`,
    );

    checkoutParams.set(
      "cancel_url",
      `${origin}/conta?checkout=cancelled`,
    );

    checkoutParams.set(
      "subscription_data[metadata][supabase_user_id]",
      user.id,
    );

    checkoutParams.set(
      "subscription_data[metadata][plan_id]",
      planId,
    );

    checkoutParams.set(
      "subscription_data[metadata][billing]",
      billing,
    );

    checkoutParams.set(
      "metadata[supabase_user_id]",
      user.id,
    );

    checkoutParams.set(
      "metadata[plan_id]",
      planId,
    );

    checkoutParams.set(
      "metadata[billing]",
      billing,
    );

    const checkoutResponse = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeSecretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: checkoutParams,
      },
    );

    const checkoutSession = await checkoutResponse.json();

    if (!checkoutResponse.ok) {
      throw new Error(
        checkoutSession?.error?.message ??
          "Não foi possível criar a sessão de pagamento.",
      );
    }

    return new Response(
      JSON.stringify({
        url: checkoutSession.url,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error(error);

    return new Response(
      JSON.stringify({
        error:
          error instanceof Error
            ? error.message
            : "Erro interno.",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      },
    );
  }
});