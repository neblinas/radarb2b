"use client";

import { useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabase";

type StripeForm = { mount: (selector: string) => void; on: (event: string, callback: (event: unknown) => void) => void };
type StripeCheckout = { createForm: (options: { layout: string }) => StripeForm; loadActions: () => Promise<{ type: string; actions?: { confirm: (options: { formConfirmEvent: unknown }) => Promise<void> } }> };
type StripeClient = { initCheckoutFormSdk: (options: { clientSecret: Promise<string>; appearance: Record<string, unknown> }) => StripeCheckout };
declare global { interface Window { Stripe?: (key: string, options: { betas: string[] }) => StripeClient; } }

type Props = { planId: "starter" | "pro"; billing: "monthly" | "annual"; onClose: () => void };

export default function StripeCheckoutForm({ planId, billing, onClose }: Props) {
  const [error, setError] = useState("");
  const mountId = `stripe-checkout-${useId().replace(/:/g, "")}`;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!window.Stripe) await new Promise<void>((resolve, reject) => { const script = document.createElement("script"); script.src = "https://js.stripe.com/dahlia/stripe.js"; script.onload = () => resolve(); script.onerror = () => reject(new Error("Não foi possível carregar a Stripe.")); document.head.appendChild(script); });
      const { data, error: functionError } = await supabase.functions.invoke("create-checkout-session", { body: { plan_id: planId, billing } });
      if (functionError || !data?.client_secret || cancelled || !window.Stripe) throw functionError || new Error("Não foi possível preparar o pagamento.");
      const stripe = window.Stripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "", { betas: ["custom_checkout_payment_form_1"] });
      const checkout = stripe.initCheckoutFormSdk({ clientSecret: Promise.resolve(data.client_secret), appearance: { theme: "stripe", labels: "auto", inputs: "spaced", variables: { borderRadius: "12px", colorPrimary: "#22d3ee", colorSuccess: "#00c853", fontSizeBase: "16px", spacingUnit: "4px" } } });
      const form = checkout.createForm({ layout: "expanded" });
      form.mount(`#${mountId}`);
      const actions = await checkout.loadActions();
      const confirmActions = actions.actions;
      if (actions.type === "success" && confirmActions) form.on("confirm", (event: unknown) => confirmActions.confirm({ formConfirmEvent: event }));
    }
    load().catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Não foi possível preparar o pagamento."); });
    return () => { cancelled = true; };
  }, [billing, mountId, planId]);

  return <div className="mt-6 rounded-2xl border border-slate-700 bg-white p-4"><div id={mountId} />{error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}<button type="button" onClick={onClose} className="mt-4 text-sm font-semibold text-slate-600">Cancelar</button></div>;
}
