import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Sales Autopilot — worker nativo (FASE 2).
 *
 * Corre com SERVICE ROLE. É invocado pelo scheduler (Supabase Cron / GitHub
 * Actions / chamada manual do back-office). Cada invocação:
 *
 *   1. reapa jobs presos;
 *   2. se as flags o permitirem, enfileira seleção de novos prospects;
 *   3. reclama e processa jobs (qualify → enrich → evaluate_contact).
 *
 * Respeita SEMPRE: kill switch, dry-run, janela de envio e suppression.
 * Em dry-run executa a lógica e registra tudo, mas NÃO envia emails.
 */

type Settings = Record<string, unknown>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function asBool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}
function asInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

async function loadSettings(admin: SupabaseClient, organizationId: string): Promise<Settings> {
  const { data, error } = await admin.rpc("automation_settings"); // requer role; ver fallback
  if (!error && data) {
    const map: Settings = {};
    for (const row of data as { key: string; value: unknown }[]) map[row.key] = row.value;
    return map;
  }
  // Fallback service-role: ler diretamente.
  const { data: rows } = await admin
    .from("app_settings")
    .select("key,value")
    .eq("organization_id", organizationId);
  const map: Settings = {};
  for (const row of (rows ?? []) as { key: string; value: unknown }[]) map[row.key] = row.value;
  return map;
}

async function resolveOrganization(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin.from("organizations").select("id").limit(1).maybeSingle();
  return data?.id ?? null;
}

/**
 * Limiares de confiança (duplicados de web/src/lib/automationState.ts —
 * as Edge Functions não partilham módulos do frontend).
 */
const HIGH_CONFIDENCE = 70;
const MEDIUM_CONFIDENCE = 40;

function classifyContactConfidence(confidence: number): {
  level: "high" | "medium" | "low";
  state: "contact_ready" | "human_review";
} {
  if (confidence >= HIGH_CONFIDENCE) return { level: "high", state: "contact_ready" };
  if (confidence >= MEDIUM_CONFIDENCE) return { level: "medium", state: "contact_ready" };
  return { level: "low", state: "human_review" };
}

Deno.serve(async (request) => {
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("RADAR_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // verify_jwt=false → protegido por segredo partilhado (scheduler/organizador).
  const expectedSecret = Deno.env.get("AUTOPILOT_CRON_SECRET");
  const providedSecret = request.headers.get("x-autopilot-secret");
  if (expectedSecret && providedSecret !== expectedSecret) {
    return json({ error: "unauthorized" }, 401);
  }

  try {
    const workerId = `autopilot-${crypto.randomUUID().slice(0, 8)}`;
    const organizationId = await resolveOrganization(admin);
    if (!organizationId) return json({ error: "Organização não encontrada" }, 400);

    const settings = await loadSettings(admin, organizationId);
    const killSwitch = asBool(settings["autopilot_kill_switch"]);
    const autopilotEnabled = asBool(settings["sales_autopilot_enabled"]);
    const dryRun = asBool(settings["autopilot_dry_run"], true);

    // Reapa jobs presos em todas as invocações (baixo custo).
    const reapTimeout = asInt(settings["autopilot_job_timeout_minutes"] ?? 15, 15);
    await admin.rpc("automation_reap_stuck_jobs", { p_timeout_minutes: reapTimeout });

    // Kill switch: pára TUDO imediatamente (não processa jobs).
    if (killSwitch) {
      return json({ ok: true, stopped: "kill_switch", dryRun });
    }

    // 1. Enfileirar seleção de novos prospects (se autopilot ligado).
    let enqueued = 0;
    if (autopilotEnabled) {
      const { data: candidates } = await admin.rpc("automation_select_prospects", {
        p_organization_id: organizationId,
        p_limit: 25,
      });
      for (const candidate of (candidates ?? []) as { company_id: string }[]) {
        const { error } = await admin.rpc("automation_enqueue", {
          p_job_type: "qualify_prospect",
          p_entity_type: "company",
          p_entity_id: candidate.company_id,
          p_payload: { organization_id: organizationId },
          p_dedup_key: `qualify:${candidate.company_id}`,
        });
        if (!error) enqueued += 1;
      }
    }

    // 2. Reclamar e processar jobs.
    const { data: jobs } = await admin.rpc("automation_claim_jobs", {
      p_worker_id: workerId,
      p_limit: 5,
    });

    let processed = 0;
    let failed = 0;

    for (const job of (jobs ?? []) as {
      id: string;
      job_type: string;
      entity_id: string | null;
      correlation_id: string;
      payload: Record<string, unknown>;
    }[]) {
      try {
        const payload = job.payload ?? {};
        const orgForJob = String(payload["organization_id"] ?? organizationId);

        if (job.job_type === "qualify_prospect" && job.entity_id) {
          const prospect = await qualifyProspect(admin, orgForJob, job.entity_id);
          if (prospect) {
            await admin.rpc("automation_enqueue", {
              p_job_type: "enrich_prospect",
              p_entity_type: "prospect",
              p_entity_id: prospect.id,
              p_payload: { organization_id: orgForJob, company_id: job.entity_id },
              p_dedup_key: `enrich:${job.entity_id}`,
            });
          }
        } else if (job.job_type === "enrich_prospect" && job.entity_id) {
          await enrichProspect(admin, orgForJob, job.entity_id, job.correlation_id, dryRun);
        }

        await admin.rpc("automation_log", {
          p_level: "info",
          p_step: `job_${job.job_type}`,
          p_message: dryRun ? "processado em dry-run" : "processado",
          p_metadata: { dry_run: dryRun },
          p_job_id: job.id,
          p_correlation_id: job.correlation_id,
        });
        await admin.rpc("automation_complete_job", { p_job_id: job.id });
        processed += 1;
      } catch (error) {
        failed += 1;
        await admin.rpc("automation_fail_job", {
          p_job_id: job.id,
          p_error: error instanceof Error ? error.message : "erro desconhecido",
        });
      }
    }

    return json({ ok: true, dryRun, enqueued, processed, failed });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Autopilot falhou" }, 500);
  }
});

async function qualifyProspect(admin: SupabaseClient, organizationId: string, companyId: string) {
  // Atribui à automação (idempotente) e registra a transição discovered.
  const { data: claimed, error } = await admin.rpc("automation_claim_prospect_service", {
    p_company_id: companyId,
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const prospect = Array.isArray(claimed) ? claimed[0] : claimed;
  if (!prospect?.id) return null;

  // Já pertence a um humano → não mexer.
  if (prospect.owner_type === "commercial" || prospect.assigned_to) return null;

  await admin.rpc("automation_record_transition_service", {
    p_prospect_id: prospect.id,
    p_to_state: "qualified",
    p_reason: "score acima do mínimo e atividade relevante",
    p_source: "automation",
  });
  return prospect;
}

async function enrichProspect(
  admin: SupabaseClient,
  organizationId: string,
  prospectId: string,
  correlationId: string,
  dryRun: boolean,
) {
  const { data: prospect } = await admin
    .from("sales_prospects")
    .select("id, company_id, owner_type")
    .eq("id", prospectId)
    .maybeSingle();
  if (!prospect) return;

  // Só enriquecer prospects da automação.
  if (prospect.owner_type !== "automation") return;

  await admin.rpc("automation_record_transition_service", {
    p_prospect_id: prospectId,
    p_to_state: "enrichment_pending",
    p_reason: "início de enriquecimento",
    p_source: "automation",
  });

  // Já temos website verificado e contactos? Salta o fetch.
  const { data: profile } = await admin
    .from("company_public_profiles")
    .select("website, website_verified")
    .eq("company_id", prospect.company_id)
    .maybeSingle();

  const { data: existingContacts } = await admin
    .from("company_public_contacts")
    .select("id, contact_type, confidence")
    .eq("company_id", prospect.company_id)
    .eq("active", true);

  let bestConfidence = 0;
  for (const contact of (existingContacts ?? []) as { contact_type: string; confidence: number }[]) {
    if (contact.contact_type.endsWith("_email")) bestConfidence = Math.max(bestConfidence, contact.confidence);
  }

  // Nesta fase o fetch de novas páginas é feito pelo discover-company-contacts
  // (que exige website verificado). Aqui apenas decidimos o estado com base no
  // que já existe, evitando fetch cego em dry-run.
  await admin.rpc("automation_set_contact_confidence_service", {
    p_prospect_id: prospectId,
    p_confidence: bestConfidence,
  });

  void profile;
  void dryRun;
  void organizationId;

  if (bestConfidence <= 0) {
    await admin.rpc("automation_record_transition_service", {
      p_prospect_id: prospectId,
      p_to_state: "no_contact",
      p_reason: "sem contactos públicos válidos",
      p_source: "automation",
      p_metadata: { correlation_id: correlationId },
    });
    return;
  }

  const decision = classifyContactConfidence(bestConfidence);
  await admin.rpc("automation_record_transition_service", {
    p_prospect_id: prospectId,
    p_to_state: decision.state,
    p_reason: `contacto ${decision.level} (confidence ${bestConfidence})`,
    p_source: "automation",
    p_metadata: { correlation_id: correlationId, confidence: bestConfidence },
  });
}
