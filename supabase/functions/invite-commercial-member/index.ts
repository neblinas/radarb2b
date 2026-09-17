import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const allowedRoles = new Set(["admin", "commercial_manager"]);

serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("RADAR_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY")!;
    const resendFrom = Deno.env.get("RESEND_FROM_EMAIL") || "Radar B2B <onboarding@resend.dev>";
    if (!supabaseUrl || !anonKey || !serviceRoleKey || !resendApiKey) throw new Error("Supabase function secrets are not configured");
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing authorization");

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user: actor } } = await userClient.auth.getUser();
    const actorRole = typeof actor?.app_metadata?.role === "string" ? actor.app_metadata.role : "";
    if (!actor || !allowedRoles.has(actorRole)) throw new Error("CRM access denied: admin or commercial_manager role required");

    const body = await request.json();
    const name = String(body.name || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const phone = String(body.phone || "").trim();
    const nif = String(body.nif || "").trim();
    const requestedRole = String(body.role || "commercial");
    if (!name || !email) throw new Error("Name and email are required");
    if (!email.includes("@")) throw new Error("Invalid email");
    if (!["commercial", "commercial_manager", "admin"].includes(requestedRole)) throw new Error("Invalid role");
    if (requestedRole === "admin" && actorRole !== "admin") throw new Error("Only an admin can invite an admin");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: organization } = await adminClient.from("organizations").select("id").limit(1).single();
    if (!organization) throw new Error("CRM organization not configured");

    const redirectTo = `${Deno.env.get("SITE_URL") || "https://radarb2b-iota.vercel.app"}/login?mode=reset`;
    const { data: invited, error: createError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: { full_name: name, phone, nif, crm_role: requestedRole, organization_id: organization.id },
    });
    if (createError || !invited.user) throw createError || new Error("Could not create invited user");

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo, data: { full_name: name, phone, nif, crm_role: requestedRole, organization_id: organization.id } },
    });
    if (linkError || !linkData.properties?.action_link) {
      await adminClient.auth.admin.deleteUser(invited.user.id);
      throw linkError || new Error("Could not generate activation link");
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: resendFrom,
        to: [email],
        subject: "A tua conta Radar B2B foi criada",
        html: `<h2>Bem-vindo ao Radar B2B</h2><p>Olá ${name},</p><p>A tua conta de colaborador foi criada com sucesso. Usa o botão abaixo para ativar a conta e definir a tua palavra-passe.</p><p><a href="${linkData.properties.action_link}">Ativar a minha conta</a></p><p>Se não reconheces este convite, ignora este email.</p>`,
      }),
    });
    if (!emailResponse.ok) {
      const emailError = await emailResponse.text();
      await adminClient.auth.admin.deleteUser(invited.user.id);
      throw new Error(`Resend email failed: ${emailError}`);
    }

    const { error: memberError } = await adminClient.from("organization_members").upsert({ organization_id: organization.id, user_id: invited.user.id, role: requestedRole, status: "invited", invited_by: actor.id }, { onConflict: "organization_id,user_id" });
    if (memberError) {
      await adminClient.auth.admin.deleteUser(invited.user.id);
      throw memberError;
    }

    await adminClient.from("admin_audit_log").insert({ organization_id: organization.id, actor_id: actor.id, action: "member_invited", entity_type: "organization_member", entity_id: invited.user.id, metadata: { email, role: requestedRole } });
    return new Response(JSON.stringify({ ok: true, user_id: invited.user.id }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Invite failed" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
