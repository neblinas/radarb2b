import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const maxPages = 5;
const maxBytes = 1_000_000;
const userAgent = "Adjudata-ContactDiscovery/1.0 (+https://adjudata.pt)";

function isPrivateAddress(address: string) {
  const value = address.toLowerCase();
  return value === "::1" || value.startsWith("fe80:") || value.startsWith("fc") || value.startsWith("fd") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(value);
}

async function safeUrl(value: string, expectedHost?: string) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error("Invalid website URL");
  if (expectedHost && parsed.hostname !== expectedHost) throw new Error("Cross-domain request blocked");
  if (["localhost", "metadata.google.internal", "169.254.169.254"].includes(parsed.hostname.toLowerCase())) throw new Error("Private host blocked");
  const records = await Deno.resolveDns(parsed.hostname, "A");
  if (!records.length || records.some(isPrivateAddress)) throw new Error("Private network blocked");
  return parsed;
}

async function fetchPublic(url: URL, host: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "text/html, text/plain;q=0.8" }, redirect: "manual", signal: controller.signal });
    if (response.status >= 300 && response.status < 400) {
      const redirect = response.headers.get("location");
      if (!redirect) throw new Error("Invalid redirect");
      return fetchPublic(await safeUrl(new URL(redirect, url).toString(), host), host);
    }
    if (!response.ok || !(response.headers.get("content-type") || "").includes("text/html")) throw new Error("Page unavailable");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > maxBytes) throw new Error("Page too large");
    const text = await response.text();
    return text.slice(0, maxBytes);
  } finally { clearTimeout(timeout); }
}

function contactType(email: string) {
  const local = email.split("@")[0].toLowerCase();
  if (/^(comercial|sales|vendas|business|businessdevelopment)/.test(local)) return "commercial_email";
  if (/^(geral|info|contacto|contact|office)/.test(local)) return "general_email";
  if (/^(support|suporte)/.test(local)) return "support_email";
  return "other";
}

function contactsFromHtml(html: string, sourceUrl: string) {
  const found: { contact_type: string; value: string; normalized_value: string; source_url: string; confidence: number }[] = [];
  const emails = html.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  for (const email of new Set(emails.map((value) => value.toLowerCase()))) found.push({ contact_type: contactType(email), value: email, normalized_value: email, source_url: sourceUrl, confidence: 65 });
  const phones = html.match(/(?:\+351\s?)?(?:2\d{2}|9\d{2})[\s.-]?\d{3}[\s.-]?\d{3}/g) || [];
  for (const phone of new Set(phones.map((value) => value.replace(/\D/g, "")))) if (phone.length >= 9) found.push({ contact_type: "phone", value: phone, normalized_value: phone, source_url: sourceUrl, confidence: 55 });
  const linkedins = html.match(/https?:\/\/(?:[\w.-]+\.)?linkedin\.com\/company\/[\w-/?=&.-]+/gi) || [];
  for (const linkedin of new Set(linkedins)) found.push({ contact_type: "linkedin", value: linkedin, normalized_value: linkedin.toLowerCase().replace(/\/$/, ""), source_url: sourceUrl, confidence: 70 });
  return found;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization) throw new Error("Missing authorization");
    const { company_id, website } = await request.json();
    if (typeof company_id !== "string" || typeof website !== "string") throw new Error("Invalid request");
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authorization } } });
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error("Invalid session");
    const { data: profile } = await supabase.from("company_public_profiles").select("website, website_verified").eq("company_id", company_id).maybeSingle();
    if (!profile?.website_verified || profile.website !== website) throw new Error("Website must be confirmed first");
    const root = await safeUrl(website);
    const robotsUrl = new URL("/robots.txt", root);
    const robots = await fetch(robotsUrl, { headers: { "User-Agent": userAgent }, signal: AbortSignal.timeout(4000) }).then((response) => response.ok ? response.text() : "").catch(() => "");
    if (/user-agent:\s*\*[^]*?disallow:\s*\//i.test(robots)) throw new Error("Website does not allow automated discovery");
    const candidates = [root.toString(), ...["/contactos", "/contact", "/contacts", "/sobre", "/about", "/empresa"].map((path) => new URL(path, root).toString())].slice(0, maxPages);
    const found = [] as ReturnType<typeof contactsFromHtml>;
    for (const candidate of candidates) { try { found.push(...contactsFromHtml(await fetchPublic(await safeUrl(candidate, root.hostname), root.hostname), candidate)); } catch { /* Unavailable pages are skipped. */ } }
    const unique = [...new Map(found.map((item) => [`${item.contact_type}:${item.normalized_value}`, item])).values()];
    if (unique.length) { const { error } = await supabase.from("company_public_contacts").upsert(unique.map((item) => ({ ...item, company_id })), { onConflict: "company_id,contact_type,normalized_value" }); if (error) throw error; }
    return Response.json({ found: unique.length }, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Contact discovery failed" }, { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});
