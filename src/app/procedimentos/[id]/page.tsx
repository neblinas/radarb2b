import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CircleDollarSign,
  ExternalLink,
  FileText,
  Landmark,
  MapPin,
  Package,
  Tag,
  Trophy,
  Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import SaveOpportunityButton from "../SaveOpportunityButton";
import ProcedureAccessGate from "../ProcedureAccessGate";

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

function formatValue(value: number | string | null) {
  if (value === null || value === undefined) return "—";

  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) return "—";

  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
  }).format(numericValue);
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
      <main className="min-h-screen bg-[#06101f] px-5 py-10 text-slate-100 sm:px-8">
        <div className="mx-auto max-w-7xl">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-cyan-300"
          >
            <ArrowLeft size={16} />
            Voltar ao dashboard
          </Link>

          <div className="mt-10 rounded-3xl border border-red-900/50 bg-red-950/20 p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-400">
              Adjudata
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-white">
              Procedimento não encontrado
            </h1>
            <p className="mt-3 text-sm text-slate-400">
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
    ]),
  );

  const { data: companiesData } = allCompanyIds.length
    ? await supabase
        .from("companies")
        .select("id, name, nif")
        .in("id", allCompanyIds)
    : { data: [] };

  const companies = companiesData ?? [];
  const companyMap = new Map(
    companies.map((company) => [company.id, company]),
  );

  const { data: contractAwardsData } = awardIds.length
    ? await supabase
        .from("contract_awards")
        .select("id, contract_id, award_id")
        .in("award_id", awardIds)
    : { data: [] };

  const contractAwards = contractAwardsData ?? [];

  const contractIds = Array.from(
    new Set(contractAwards.map((item) => item.contract_id)),
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
    new Set(contractCpvs.map((item) => item.cpv_id)),
  );

  const { data: cpvsData } = cpvIds.length
    ? await supabase
        .from("cpvs")
        .select("id, cpv_code, description, radar_category")
        .in("id", cpvIds)
    : { data: [] };

  const cpvs = cpvsData ?? [];

  const cpvMap = new Map(cpvs.map((cpv) => [cpv.id, cpv]));
  const awardMap = new Map(awards.map((award) => [award.id, award]));

  const totalContractValue = contracts.reduce(
    (sum, contract) => sum + (Number(contract.contract_value) || 0),
    0,
  );

  const totalAwardValue = awards.reduce(
    (sum, award) => sum + (Number(award.award_value) || 0),
    0,
  );

  const awardDifference = procedure.base_price !== null
    ? Number(procedure.base_price) - totalAwardValue
    : null;

  const awardDifferencePercentage =
    procedure.base_price && Number(procedure.base_price) > 0 && awardDifference !== null
      ? (awardDifference / Number(procedure.base_price)) * 100
      : null;

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
    <main className="min-h-screen bg-[#06101f] text-slate-100">
      <ProcedureAccessGate>
      <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 lg:px-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 transition hover:text-cyan-300"
        >
          <ArrowLeft size={16} />
          Voltar ao dashboard
        </Link>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
          <div className="min-w-0 space-y-6">
            <section className="relative overflow-hidden rounded-[28px] border border-cyan-950/80 bg-[#09182a]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(34,211,238,0.16),transparent_33%)]" />
              <div className="pointer-events-none absolute right-[-80px] top-[-100px] h-80 w-80 rounded-full border border-cyan-500/10" />
              <div className="pointer-events-none absolute right-6 top-10 h-40 w-40 rounded-full bg-cyan-500/5 blur-3xl" />

              <div className="relative p-6 sm:p-8 lg:p-10">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-400">
                    Procedimento público
                  </span>

                  <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-300">
                    {procedure.procedure_type || "Tipo não indicado"}
                  </span>
                </div>

                <h1 className="mt-5 max-w-5xl text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-[42px]">
                  {procedure.object || "Objeto não disponível"}
                </h1>

                 <p className="mt-4 max-w-2xl text-sm leading-6 text-cyan-100/70">
                   Avalia esta oportunidade com base no valor, entidade compradora,
                   concorrência e histórico associado.
                 </p>

                 <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
                  <span>
                    ID fonte:{" "}
                    <strong className="font-medium text-slate-300">
                      {procedure.source_id || "—"}
                    </strong>
                  </span>

                  <span>
                    Publicação no BASE:{" "}
                    <strong className="font-medium text-slate-300">
                      {formatDate(procedure.publication_date)}
                    </strong>
                  </span>

                  {procedure.source_url ? (
                    <a
                      href={procedure.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 font-medium text-cyan-400 hover:text-cyan-300"
                    >
                      Abrir concurso no BASE
                      <ExternalLink size={13} />
                    </a>
                  ) : null}
                </div>

                {procedure.description ? (
                  <p className="mt-6 max-w-4xl text-sm leading-7 text-slate-300">
                    {procedure.description}
                  </p>
                ) : null}

                <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-2xl border border-cyan-900/50 bg-[#071321]/75 p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <CircleDollarSign size={15} className="text-cyan-400" />
                      Preço base
                    </div>
                    <p className="mt-2 text-xl font-semibold text-white">
                      {formatValue(procedure.base_price)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#071321]/75 p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Trophy size={15} className="text-amber-400" />
                      Adjudicações
                    </div>
                    <p className="mt-2 text-xl font-semibold text-white">
                      {formatNumber(awards.length)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#071321]/75 p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Package size={15} className="text-violet-400" />
                      Contratos
                    </div>
                    <p className="mt-2 text-xl font-semibold text-white">
                      {formatNumber(contracts.length)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-[#071321]/75 p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Users size={15} className="text-emerald-400" />
                      Participantes
                    </div>
                    <p className="mt-2 text-xl font-semibold text-white">
                      {formatNumber(participants.length)}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <nav className="overflow-x-auto rounded-2xl border border-slate-800 bg-[#081525] px-2">
              <div className="flex min-w-max">
                {[
                  ["#visao-geral", "Visão geral"],
                  ["#adjudicatarios", "Adjudicatários"],
                  ["#participantes", "Participantes"],
                  ["#contratos", "Contratos"],
                  ["#cpvs", "CPVs"],
                ].map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    className="border-b-2 border-transparent px-5 py-4 text-sm font-medium text-slate-400 transition hover:border-cyan-400 hover:text-white"
                  >
                    {label}
                  </a>
                ))}
              </div>
            </nav>

            <section
              id="visao-geral"
              className="scroll-mt-24 rounded-3xl border border-slate-800 bg-[#081525] p-6 sm:p-7"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                  <FileText size={19} />
                </div>

                <div>
                  <h2 className="text-base font-semibold text-white">
                    Descrição do procedimento
                  </h2>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-300">
                    {procedure.description ||
                      "Sem descrição adicional disponível."}
                  </p>
                </div>
              </div>
            </section>

            <section
              id="adjudicatarios"
              className="scroll-mt-24 space-y-3"
            >
              <div className="flex items-center gap-3 px-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                  <Trophy size={18} />
                </div>
                <div>
                  <h2 className="font-semibold text-white">
                    Adjudicatários
                  </h2>
                  <p className="text-xs text-slate-500">
                    Empresas selecionadas e respetivos valores
                  </p>
                </div>
              </div>

              {awardsWithCompany.length ? (
                <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[#081525]">
                  {awardsWithCompany.map((award, index) => (
                    <div
                      key={award.id}
                      className="grid gap-4 border-b border-slate-800 p-5 last:border-0 sm:p-6 lg:grid-cols-[50px_minmax(0,1fr)_150px_170px_130px]"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/10 text-sm font-semibold text-cyan-300">
                        {index + 1}
                      </div>

                      <div className="min-w-0">
                        <p className="font-semibold text-white">
                          {award.company?.name || "Empresa não identificada"}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          NIF {award.company?.nif || "—"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-600">
                          Lote
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                          {award.lot || "Sem lote"}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-600">
                          Valor adjudicado
                        </p>
                        <p className="mt-1 font-semibold text-white">
                          {formatValue(award.award_value)}
                        </p>
                      </div>

                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-slate-600">
                          Data
                        </p>
                        <p className="mt-1 text-sm text-slate-300">
                          {formatDate(award.award_date)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-slate-800 bg-[#081525] p-6 text-sm text-slate-500">
                  Não existem adjudicatários identificados.
                </div>
              )}
            </section>

            <section
              id="participantes"
              className="scroll-mt-24 space-y-3"
            >
              <div className="flex items-center gap-3 px-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                  <Users size={18} />
                </div>
                <div>
                  <h2 className="font-semibold text-white">
                    Participantes
                  </h2>
                  <p className="text-xs text-slate-500">
                    Empresas identificadas no procedimento
                  </p>
                </div>
              </div>

              {participantsWithCompany.length ? (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {participantsWithCompany.map((participant) => (
                    <div
                      key={participant.id}
                      className="rounded-2xl border border-slate-800 bg-[#081525] p-5"
                    >
                      <div className="flex gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                          <Building2 size={16} />
                        </div>

                        <div>
                          <p className="text-sm font-semibold text-white">
                            {participant.company?.name ||
                              "Empresa não identificada"}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            NIF {participant.company?.nif || "—"}
                          </p>
                        </div>
                      </div>

                      <div className="mt-4 border-t border-slate-800 pt-4">
                        <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-300">
                          {participant.participant_type || "Participante"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-slate-800 bg-[#081525] p-6 text-sm text-slate-500">
                  Não existem participantes identificados.
                </div>
              )}
            </section>

            <section
              id="contratos"
              className="scroll-mt-24 space-y-3"
            >
              <div className="flex items-center gap-3 px-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-400">
                  <Package size={18} />
                </div>
                <div>
                  <h2 className="font-semibold text-white">
                    Contratos associados
                  </h2>
                  <p className="text-xs text-slate-500">
                    Contratos resultantes das adjudicações
                  </p>
                </div>
              </div>

              {contracts.length ? (
                <div className="space-y-3">
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
                      <article
                        key={contract.id}
                        className="rounded-3xl border border-slate-800 bg-[#081525] p-5 sm:p-6"
                      >
                        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_180px]">
                          <div>
                            <div className="flex flex-wrap gap-2">
                              {contract.contract_type ? (
                                <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400">
                                  {contract.contract_type}
                                </span>
                              ) : null}

                              {contract.status ? (
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
                                  {contract.status}
                                </span>
                              ) : null}
                            </div>

                            <h3 className="mt-3 font-semibold leading-6 text-white">
                              {contract.object || "Objeto não disponível"}
                            </h3>

                            <div className="mt-4 grid gap-4 text-xs sm:grid-cols-2 lg:grid-cols-3">
                              <div>
                                <p className="uppercase tracking-wider text-slate-600">
                                  ID fonte
                                </p>
                                <p className="mt-1 text-slate-400">
                                  {contract.source_id || "—"}
                                </p>
                              </div>

                              <div>
                                <p className="uppercase tracking-wider text-slate-600">
                                  Data
                                </p>
                                <p className="mt-1 text-slate-400">
                                  {formatDate(contract.contract_date)}
                                </p>
                              </div>

                              <div>
                                <p className="uppercase tracking-wider text-slate-600">
                                  Fim da execução
                                </p>
                                <p className="mt-1 text-slate-400">
                                  {formatDate(contract.execution_end_date)}
                                </p>
                              </div>

                              <div>
                                <p className="uppercase tracking-wider text-slate-600">
                                  Localização
                                </p>
                                <p className="mt-1 text-slate-400">
                                  {contract.location || "—"}
                                </p>
                              </div>

                              <div className="sm:col-span-2">
                                <p className="uppercase tracking-wider text-slate-600">
                                  Adjudicante
                                </p>
                                <p className="mt-1 text-slate-400">
                                  {contract.adjudicante_name || "—"}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-cyan-950 bg-[#06101f] p-4">
                            <p className="text-[10px] uppercase tracking-wider text-slate-600">
                              Valor contratual
                            </p>
                            <p className="mt-2 text-xl font-semibold text-white">
                              {formatValue(contract.contract_value)}
                            </p>
                          </div>
                        </div>

                        {linkedCpvs.length ? (
                          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-5">
                            {linkedCpvs.map((cpv) => (
                              <span
                                key={cpv!.id}
                                className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-[#06101f] px-2.5 py-1 text-xs text-slate-300"
                              >
                                <Tag size={12} className="text-cyan-400" />
                                {cpv!.cpv_code}
                              </span>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-4 flex flex-wrap items-center gap-4">
                          {linkedAwards.length ? (
                            <span className="text-xs text-slate-500">
                              {linkedAwards.length} adjudicação
                              {linkedAwards.length === 1 ? "" : "ões"} associada
                              {linkedAwards.length === 1 ? "" : "s"}
                            </span>
                          ) : null}

                          {contract.document_url ? (
                            <a
                              href={contract.document_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300"
                            >
                              <FileText size={13} />
                              Documento
                              <ExternalLink size={11} />
                            </a>
                          ) : null}

                          {contract.source_url ? (
                            <a
                              href={contract.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-400 hover:text-cyan-300"
                            >
                              Fonte
                              <ExternalLink size={11} />
                            </a>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-3xl border border-slate-800 bg-[#081525] p-6 text-sm text-slate-500">
                  Não existem contratos associados identificados.
                </div>
              )}
            </section>

            <section
              id="cpvs"
              className="scroll-mt-24 space-y-3"
            >
              <div className="flex items-center gap-3 px-1">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
                  <Tag size={18} />
                </div>
                <div>
                  <h2 className="font-semibold text-white">
                    CPVs envolvidos
                  </h2>
                  <p className="text-xs text-slate-500">
                    Classificação dos contratos associados
                  </p>
                </div>
              </div>

              {cpvs.length ? (
                <div className="overflow-hidden rounded-3xl border border-slate-800 bg-[#081525]">
                  {cpvs.map((cpv) => (
                    <div
                      key={cpv.id}
                      className="flex flex-col gap-3 border-b border-slate-800 p-5 last:border-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-semibold text-cyan-300">
                          {cpv.cpv_code}
                        </p>
                        <p className="mt-1 text-sm text-slate-400">
                          {cpv.description || "Sem descrição"}
                        </p>
                      </div>

                      {cpv.radar_category ? (
                        <span className="shrink-0 rounded-full border border-slate-700 px-3 py-1 text-[11px] uppercase tracking-wider text-slate-400">
                          {cpv.radar_category}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-3xl border border-slate-800 bg-[#081525] p-6 text-sm text-slate-500">
                  Não existem CPVs associados.
                </div>
              )}
            </section>
          </div>

           <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
             <section className="rounded-3xl border border-cyan-500/20 bg-gradient-to-b from-cyan-500/10 to-[#081525] p-6 shadow-[0_16px_50px_rgba(8,145,178,0.08)]">
              <div className="flex items-center gap-3">
                <Landmark size={19} className="text-cyan-400" />
                <h2 className="font-semibold text-white">
                  Entidade compradora
                </h2>
              </div>

              {buyer ? (
                <div className="mt-6">
                  <p className="font-semibold leading-6 text-white">
                    {buyer.name}
                  </p>

                  <p className="mt-2 text-sm text-slate-500">
                    NIF {buyer.nif || "—"}
                  </p>

                  <div className="mt-5 space-y-4 border-t border-slate-800 pt-5">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-600">
                        Tipo
                      </p>
                      <p className="mt-1 text-sm text-slate-300">
                        {buyer.entity_type || "—"}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-slate-600">
                        Localização
                      </p>
                      <p className="mt-1 text-sm leading-6 text-slate-300">
                        {[buyer.municipality, buyer.district, buyer.region]
                          .filter(Boolean)
                          .join(" · ") || "Não disponível"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="mt-5 text-sm text-slate-500">
                  Entidade não identificada.
                </p>
              )}

               <div className="mt-6 border-t border-cyan-500/15 pt-6">
                 <p className="mb-3 text-xs leading-5 text-slate-400">
                   Guarda este procedimento para acompanhar a oportunidade e
                   compará-la com outras pesquisas.
                 </p>
                <SaveOpportunityButton procedureId={procedure.id} />
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-[#081525] p-6">
              <div className="flex items-center gap-3">
                <CalendarDays size={18} className="text-cyan-400" />
                <h2 className="font-semibold text-white">
                  Datas importantes
                </h2>
              </div>

              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-xs text-slate-500">
                    Publicação no BASE
                  </p>
                  <p className="mt-1 font-semibold text-white">
                    {formatDate(procedure.publication_date)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Decisão
                  </p>
                  <p className="mt-1 font-semibold text-white">
                    {formatDate(procedure.decision_date)}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-[#081525] p-6">
              <div className="flex items-center gap-3">
                <CircleDollarSign size={18} className="text-cyan-400" />
                <h2 className="font-semibold text-white">
                  Resumo financeiro
                </h2>
              </div>

              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-xs text-slate-500">
                    Preço base
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {formatValue(procedure.base_price)}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-500">
                    Valor adjudicado
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {formatValue(totalAwardValue)}
                  </p>
                </div>

                {awardDifference !== null && awardDifference > 0 ? (
                  <div>
                    <p className="text-xs text-slate-500">
                      Diferença face ao preço base
                    </p>
                    <p className="mt-1 text-lg font-semibold text-emerald-300">
                      {formatValue(awardDifference)}
                    </p>
                    {awardDifferencePercentage !== null ? (
                      <p className="mt-1 text-xs text-emerald-400/70">
                        {awardDifferencePercentage.toLocaleString("pt-PT", {
                          maximumFractionDigits: 1,
                        })}% abaixo do preço base
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div>
                  <p className="text-xs text-slate-500">
                    Valor contratado
                  </p>
                  <p className="mt-1 text-lg font-semibold text-white">
                    {formatValue(totalContractValue)}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-800 bg-[#081525] p-6">
              <div className="flex items-center gap-3">
                <MapPin size={18} className="text-cyan-400" />
                <h2 className="font-semibold text-white">
                  Informação adicional
                </h2>
              </div>

              <div className="mt-5 space-y-5">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-600">
                    Acordo
                  </p>
                  <p className="mt-1 text-sm text-slate-300">
                    {procedure.agreement_id || "—"}
                  </p>
                </div>

                <div>
                  <p className="text-[10px] uppercase tracking-wider text-slate-600">
                    Descrição do acordo
                  </p>
                  <p className="mt-1 text-sm leading-6 text-slate-300">
                    {procedure.agreement_description || "—"}
                  </p>
                </div>

                {procedure.source_url ? (
                  <a
                    href={procedure.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 border-t border-slate-800 pt-5 text-sm font-medium text-cyan-400 transition hover:text-cyan-300"
                  >
                    Ver fonte original
                    <ExternalLink size={13} />
                  </a>
                ) : null}
              </div>
            </section>
          </aside>
        </div>
      </div>
      </ProcedureAccessGate>
    </main>
  );
}