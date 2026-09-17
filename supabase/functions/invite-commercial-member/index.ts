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
    if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase function secrets are not configured");
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
    const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { full_name: name, phone, nif, crm_role: requestedRole, organization_id: organization.id },
    });
    if (inviteError) throw inviteError;

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
