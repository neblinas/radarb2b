import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  FileText,
  MapPin,
  Euro,
  Users,
  Trophy,
  Package,
  Tag,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import SaveOpportunityButton from "../SaveOpportunityButton";

type PageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("pt-PT");
}

function formatValue(value: number | null) {
  if (value === null || value === undefined) return "—";

  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-PT").format(value);
}

export default async function ProcedurePage({ params }: PageProps) {
  const { id } = await params;

  const { data: procedure, error } = await supabase
    .from("procedures")
    .select(`
      id,
      source_id,
      procedure_type,
      object,
      description,
      publication_date,
      decision_date,
      base_price,
      agreement_id,
      agreement_description,
      source_url,
      buyer_id
    `)
    .eq("id", id)
    .single();

  if (error || !procedure) {
    return (
      <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
        <div className="mx-auto max-w-4xl">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <ArrowLeft size={16} />
            Voltar ao dashboard
          </Link>

          <div className="mt-8 rounded-2xl border border-red-900/50 bg-red-950/20 p-6">
            <h1 className="text-xl font-semibold">
              Procedimento não encontrado
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              Não foi possível carregar este procedimento.
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { data: buyer } = procedure.buyer_id
    ? await supabase
        .from("entities")
        .select("id, name, nif, entity_type, region, district, municipality")
        .eq("id", procedure.buyer_id)
        .single()
    : { data: null };

  const { data: awardsData } = await supabase
    .from("awards")
    .select("id, procedure_id, company_id, lot, award_value, award_date")
    .eq("procedure_id", procedure.id)
    .order("lot", { ascending: true });

  const awards = awardsData ?? [];
  const awardIds = awards.map((item) => item.id);
  const companyIds = awards.map((item) => item.company_id);

  const { data: participantsData } = await supabase
    .from("procedure_participants")
    .select("id, procedure_id, company_id, participant_type")
    .eq("procedure_id", procedure.id);

  const participants = participantsData ?? [];

  const allCompanyIds = Array.from(
    new Set([
      ...companyIds,
      ...participants.map((item) => item.company_id),
    ])
  );

  const { data: companiesData } = allCompanyIds.length
    ? await supabase
        .from("companies")
        .select("id, name, nif")
        .in("id", allCompanyIds)
    : { data: [] };

  const companies = companiesData ?? [];
  const companyMap = new Map(companies.map((company) => [company.id, company]));

  const { data: contractAwardsData } = awardIds.length
    ? await supabase
        .from("contract_awards")
        .select("id, contract_id, award_id")
        .in("award_id", awardIds)
    : { data: [] };

  const contractAwards = contractAwardsData ?? [];
  const contractIds = Array.from(
    new Set(contractAwards.map((item) => item.contract_id))
  );

  const { data: contractsData } = contractIds.length
    ? await supabase
        .from("contracts")
        .select(`
          id,
          source_id,
          contract_type,
          object,
          contract_value,
          publication_date,
          contract_date,
          execution_end_date,
          location,
          status,
          document_url,
          source_url,
          adjudicante_id,
          adjudicante_name
        `)
        .in("id", contractIds)
        .order("contract_date", { ascending: false })
    : { data: [] };

  const contracts = contractsData ?? [];

  const { data: contractCpvsData } = contractIds.length
    ? await supabase
        .from("contract_cpvs")
        .select("id, contract_id, cpv_id, is_primary")
        .in("contract_id", contractIds)
    : { data: [] };

  const contractCpvs = contractCpvsData ?? [];
  const cpvIds = Array.from(
    new Set(contractCpvs.map((item) => item.cpv_id))
  );

  const { data: cpvsData } = cpvIds.length
    ? await supabase
        .from("cpvs")
        .select("id, cpv_code, description, radar_category")
        .in("id", cpvIds)
    : { data: [] };

  const cpvs = cpvsData ?? [];
  const cpvMap = new Map(cpvs.map((cpv) => [cpv.id, cpv]));

  const contractMap = new Map(contracts.map((contract) => [contract.id, contract]));
  const awardMap = new Map(awards.map((award) => [award.id, award]));

  const totalContractValue = contracts.reduce(
    (sum, contract) => sum + (Number(contract.contract_value) || 0),
    0
  );

  const totalAwardValue = awards.reduce(
    (sum, award) => sum + (Number(award.award_value) || 0),
    0
  );

  const participantsWithCompany = participants
    .map((participant) => ({
      ...participant,
      company: companyMap.get(participant.company_id),
    }))
    .filter((item) => item.company);

  const awardsWithCompany = awards
    .map((award) => ({
      ...award,
      company: companyMap.get(award.company_id),
    }))
    .filter((item) => item.company);

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/95">
        <div className="mx-auto max-w-6xl px-5 py-5 sm:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-cyan-400"
          >
            <ArrowLeft size={16} />
            Voltar ao dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 sm:px-8">
        <section>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
              <FileText size={22} />
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
                Procedimento
              </p>
              <p className="text-xs text-slate-600">
                ID fonte: {procedure.source_id || "—"}
              </p>

              <div className="mt-4">
                <SaveOpportunityButton procedureId={procedure.id} />
              </div>
            </div>
          </div>

          <h1 className="mt-5 max-w-5xl text-2xl font-bold tracking-tight sm:text-3xl">
            {procedure.object || "Objeto não disponível"}
          </h1>

          <div className="mt-4 inline-flex rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-400">
            {procedure.procedure_type || "Tipo não indicado"}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Euro size={15} />
              Preço base
            </div>
            <p className="mt-3 text-lg font-semibold">
              {formatValue(procedure.base_price)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <CalendarDays size={15} />
              Publicação
            </div>
            <p className="mt-3 text-lg font-semibold">
              {formatDate(procedure.publication_date)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <CalendarDays size={15} />
              Decisão
            </div>
            <p className="mt-3 text-lg font-semibold">
              {formatDate(procedure.decision_date)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Trophy size={15} />
              Awards
            </div>
            <p className="mt-3 text-lg font-semibold">
              {formatNumber(awards.length)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Package size={15} />
              Contratos
            </div>
            <p className="mt-3 text-lg font-semibold">
              {formatNumber(contracts.length)}
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 lg:col-span-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Descrição
            </h2>

            <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-300">
              {procedure.description || "Sem descrição adicional disponível."}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Entidade compradora
            </h2>

            {buyer ? (
              <div className="mt-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-white">{buyer.name}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    NIF: {buyer.nif || "—"}
                  </p>
                </div>

                <div className="border-t border-slate-800 pt-3 text-xs text-slate-400">
                  <p>{buyer.entity_type || "—"}</p>
                  <p className="mt-1">
                    {[buyer.municipality, buyer.district, buyer.region]
                      .filter(Boolean)
                      .join(" · ") || "Localização não disponível"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Entidade compradora não identificada.
              </p>
            )}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Valor dos awards
            </p>
            <p className="mt-2 text-xl font-semibold">
              {formatValue(totalAwardValue)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Valor dos contratos
            </p>
            <p className="mt-2 text-xl font-semibold">
              {formatValue(totalContractValue)}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Participantes
            </p>
            <p className="mt-2 text-xl font-semibold">
              {formatNumber(participants.length)}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center gap-2">
            <Trophy size={18} className="text-cyan-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Adjudicatários
            </h2>
          </div>

          {awardsWithCompany.length ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-800">
              <div className="grid grid-cols-[1fr_120px_160px] gap-4 border-b border-slate-800 bg-slate-950/60 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <span>Empresa</span>
                <span>Lote</span>
                <span>Valor do award</span>
              </div>

              {awardsWithCompany.map((award) => (
                <div
                  key={award.id}
                  className="grid grid-cols-[1fr_120px_160px] gap-4 border-b border-slate-800/70 px-4 py-4 last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium text-white">
                      {award.company?.name || "Empresa não identificada"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      NIF: {award.company?.nif || "—"}
                    </p>
                  </div>

                  <span className="text-sm text-slate-300">
                    {award.lot || "Sem lote"}
                  </span>

                  <span className="text-sm font-medium text-slate-200">
                    {formatValue(award.award_value)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Não existem adjudicatários identificados para este procedimento.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-cyan-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Participantes
            </h2>
          </div>

          {participantsWithCompany.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {participantsWithCompany.map((participant) => (
                <div
                  key={participant.id}
                  className="rounded-xl border border-slate-800 bg-slate-950/40 p-4"
                >
                  <p className="text-sm font-medium text-white">
                    {participant.company?.name || "Empresa não identificada"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    NIF: {participant.company?.nif || "—"}
                  </p>
                  <p className="mt-2 text-xs text-cyan-400">
                    {participant.participant_type || "Participante"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Não existem participantes identificados para este procedimento.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center gap-2">
            <Package size={18} className="text-cyan-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Contratos associados
            </h2>
          </div>

          {contracts.length ? (
            <div className="mt-4 space-y-3">
              {contracts.map((contract) => {
                const linkedAwards = contractAwards
                  .filter((link) => link.contract_id === contract.id)
                  .map((link) => awardMap.get(link.award_id))
                  .filter(Boolean);

                const linkedCpvs = contractCpvs
                  .filter((link) => link.contract_id === contract.id)
                  .map((link) => cpvMap.get(link.cpv_id))
                  .filter(Boolean);

                return (
                  <div
                    key={contract.id}
                    className="rounded-xl border border-slate-800 bg-slate-950/40 p-5"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">
                          {contract.object || "Objeto não disponível"}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                          <span>
                            ID fonte: {contract.source_id || "—"}
                          </span>
                          <span>
                            Data: {formatDate(contract.contract_date)}
                          </span>
                          <span>
                            Estado: {contract.status || "—"}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-left lg:text-right">
                        <p className="text-xs text-slate-500">
                          Valor contratual
                        </p>
                        <p className="mt-1 text-base font-semibold text-white">
                          {formatValue(contract.contract_value)}
                        </p>
                      </div>
                    </div>

                    {linkedCpvs.length ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {linkedCpvs.map((cpv) => (
                          <span
                            key={cpv!.id}
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-300"
                          >
                            <Tag size={12} />
                            {cpv!.cpv_code}
                            {cpv!.description
                              ? ` — ${cpv!.description}`
                              : ""}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    {linkedAwards.length ? (
                      <p className="mt-3 text-xs text-slate-500">
                        {linkedAwards.length} award
                        {linkedAwards.length === 1 ? "" : "s"} associado
                        {linkedAwards.length === 1 ? "" : "s"}.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Não existem contratos associados identificados.
            </p>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              CPVs envolvidos
            </h2>

            {cpvs.length ? (
              <div className="mt-4 space-y-2">
                {cpvs.map((cpv) => (
                  <div
                    key={cpv.id}
                    className="rounded-xl bg-slate-950/40 p-3"
                  >
                    <p className="text-sm font-semibold text-cyan-400">
                      {cpv.cpv_code}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {cpv.description || "Sem descrição"}
                    </p>
                    {cpv.radar_category ? (
                      <p className="mt-2 text-[11px] uppercase tracking-wider text-slate-600">
                        {cpv.radar_category}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Não existem CPVs associados aos contratos deste procedimento.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
              Informação adicional
            </h2>

            <div className="mt-4 space-y-3 text-sm text-slate-300">
              {procedure.agreement_id && (
                <p>
                  <span className="text-slate-500">Acordo:</span>{" "}
                  {procedure.agreement_id}
                </p>
              )}

              {procedure.agreement_description && (
                <p>
                  <span className="text-slate-500">Descrição:</span>{" "}
                  {procedure.agreement_description}
                </p>
              )}

              {procedure.source_url && (
                <a
                  href={procedure.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300"
                >
                  <MapPin size={15} />
                  Consultar fonte original
                </a>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}






