"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { brand } from "@/lib/brand";

import {
  BellRing,
  BookmarkCheck,
  Building2,
  ChartNoAxesCombined,
  FileSignature,
  Gavel,
  Landmark,
  SearchCheck,
  ShieldCheck,
  Users,
} from "lucide-react";

const initialKpis = [
  { label: "Procedimentos", value: "—", icon: Gavel, detail: "concursos e procedimentos" },
  { label: "Contratos", value: "—", icon: FileSignature, detail: "contratos analisados" },
  { label: "Empresas", value: "—", icon: Building2, detail: "empresas identificadas" },
  { label: "Entidades", value: "—", icon: Landmark, detail: "compradores públicos" },
];

const modules = [
  {
    title: "Pesquisar procedimentos",
    description: "Pesquisa concursos, consultas e outros procedimentos de contratação.",
    icon: SearchCheck,
    href: "/pesquisa",
  },
  {
    title: "Pesquisas guardadas",
    description: "Volta rapidamente às combinações de filtros que guardaste.",
    icon: BookmarkCheck,
    href: "/pesquisas-guardadas",
  },
  {
    title: "Oportunidades guardadas",
    description: "Consulta e gere os procedimentos que marcaste para acompanhar.",
    icon: ChartNoAxesCombined,
    href: "/oportunidades",
  },
  {
    title: "Alertas",
    description: "Gere os alertas automáticos criados a partir das tuas pesquisas.",
    icon: BellRing,
    href: "/alertas",
  },
  {
    title: "Planos Adjudata",
    description: "Compara a capacidade de pesquisa e acompanhamento de cada plano.",
    icon: ShieldCheck,
    href: "/planos",
  },
  {
    title: "Programa comercial",
    description: "Apresenta o Adjudata, cresce com a tua equipa e acompanha os teus ganhos.",
    icon: Users,
    href: "/recrutamento",
  },
];

export default function DashboardClient() {
  const [kpis, setKpis] = useState(initialKpis);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<{
    procedures: { id: string; object: string | null; procedure_type: string | null }[];
    companies: { id: string; name: string | null; nif: string | null }[];
    entities: { id: string; name: string | null; nif: string | null }[];
    cpvs: { id: string; cpv_code: string | null; description: string | null }[];
  }>({ procedures: [], companies: [], entities: [], cpvs: [] });

  useEffect(() => {
    async function loadKpis() {
      const tables = ["procedures", "contracts", "companies", "entities"];
      const results = await Promise.all(
        tables.map((table) => supabase.from(table).select("id", { count: "exact", head: true })),
      );
      setKpis((current) =>
        current.map((kpi, index) => ({
          ...kpi,
          value: results[index].error
            ? "—"
            : (results[index].count ?? 0).toLocaleString("pt-PT"),
        })),
      );
    }
    loadKpis();
  }, []);

  useEffect(() => {
    const term = search.trim();
    if (!term) return;

    const timer = setTimeout(async () => {
      const pattern = `%${term}%`;
      const [procedures, companies, entities, cpvs] = await Promise.all([
        supabase.from("procedures").select("id, object, procedure_type").or(`object.ilike.${pattern},description.ilike.${pattern}`).limit(5),
        supabase.from("companies").select("id, name, nif").or(`name.ilike.${pattern},nif.ilike.${pattern}`).limit(5),
        supabase.from("entities").select("id, name, nif").or(`name.ilike.${pattern},nif.ilike.${pattern}`).limit(5),
        supabase.from("cpvs").select("id, cpv_code, description").or(`cpv_code.ilike.${pattern},description.ilike.${pattern}`).limit(5),
      ]);
      setSearchResults({
        procedures: procedures.data ?? [],
        companies: companies.data ?? [],
        entities: entities.data ?? [],
        cpvs: cpvs.data ?? [],
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [search]);

  return (
    <main className="min-h-screen text-slate-100">
      <section className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[28px] border border-cyan-950/80 bg-[#09182a] p-6 sm:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(34,211,238,0.16),transparent_33%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Painel</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                {brand.slogan}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400 sm:text-base">
                Pesquisa procedimentos, acompanha oportunidades e identifica padrões de contratação pública num único espaço.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-5 py-4 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Base de dados</div>
              <div className="mt-1 text-sm font-semibold text-slate-200">Portugal · dados BASE atualizados semanalmente</div>
            </div>
          </div>
        </div>

        <section className="mt-8">
          <div className="relative">
            <SearchCheck className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar empresa, entidade, procedimento ou CPV..."
              className="h-14 w-full rounded-2xl border border-slate-800 bg-slate-900/80 pl-12 pr-5 text-sm text-white shadow-sm outline-none transition placeholder:text-slate-600 focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10"
            />
          </div>

          {search.trim() && (
            <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/95 p-4 shadow-xl">
              <div className="grid gap-4 lg:grid-cols-3">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Procedimentos</p>
                  {searchResults.procedures.length ? (
                    searchResults.procedures.map((item) => (
                      <Link key={item.id} href={`/procedimentos/${item.id}`}
                        className="mb-2 block rounded-xl border border-transparent bg-slate-800/60 p-3 transition hover:border-cyan-500/20 hover:bg-slate-800">
                        <p className="text-sm font-medium text-white">
                          {(item.object || "Sem objeto").slice(0, 120)}
                          {(item.object || "").length > 120 ? "…" : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">{item.procedure_type || "Procedimento"} · Saber mais</p>
                      </Link>
                    ))
                  ) : (
                    <p className="text-xs text-slate-600">Sem resultados.</p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Empresas</p>
                  {searchResults.companies.length ? (
                    searchResults.companies.map((item) => (
                      <Link key={item.id} href={`/pesquisa?query=${encodeURIComponent(item.name || item.nif || "")}`}
                        className="mb-2 block rounded-xl bg-slate-800/60 p-3 transition hover:bg-slate-800">
                        <p className="text-sm font-medium text-white">{item.name || "Sem nome"}</p>
                        <p className="mt-1 text-xs text-slate-500">NIF {item.nif || "—"}</p>
                      </Link>
                    ))
                  ) : (
                    <p className="text-xs text-slate-600">Sem resultados.</p>
                  )}
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Entidades</p>
                  {searchResults.entities.length ? (
                    searchResults.entities.map((item) => (
                      <Link key={item.id} href={`/pesquisa?query=${encodeURIComponent(item.name || item.nif || "")}`}
                        className="mb-2 block rounded-xl bg-slate-800/60 p-3 transition hover:bg-slate-800">
                        <p className="text-sm font-medium text-white">{item.name || "Sem nome"}</p>
                        <p className="mt-1 text-xs text-slate-500">NIF {item.nif || "—"}</p>
                      </Link>
                    ))
                  ) : (
                    <p className="text-xs text-slate-600">Sem resultados.</p>
                  )}
                </div>
              </div>

              {searchResults.cpvs.length > 0 && (
                <div className="mt-4 border-t border-slate-800 pt-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">CPVs</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {searchResults.cpvs.map((item) => (
                      <Link key={item.id} href={`/pesquisa?query=${encodeURIComponent(item.cpv_code || item.description || "")}`}
                        className="rounded-xl bg-slate-800/60 p-3 transition hover:bg-slate-800">
                        <p className="text-sm font-semibold text-cyan-400">{item.cpv_code || "Sem código"}</p>
                        <p className="mt-1 text-xs text-slate-400">{item.description || "Sem descrição"}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div key={kpi.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400">{kpi.label}</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight text-white">{kpi.value}</p>
                  </div>
                  <div className="rounded-xl border border-cyan-400/10 bg-cyan-400/10 p-2.5 text-cyan-300">
                    <Icon size={20} />
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-600">{kpi.detail}</p>
              </div>
            );
          })}
        </section>

        <section className="mt-10">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white">Área de trabalho</h2>
            <p className="mt-1 text-sm text-slate-500">Acede diretamente às funcionalidades principais do Adjudata.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {modules.map((module) => {
              const Icon = module.icon;
              return (
                <Link key={module.title} href={module.href}
                  className="group rounded-2xl border border-slate-800 bg-slate-900/50 p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-500/30 hover:bg-slate-900/80">
                  <div className="flex h-full flex-col">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-cyan-300 transition group-hover:bg-cyan-400/10">
                      <Icon size={20} />
                    </div>
                    <h3 className="mt-5 font-semibold text-white">{module.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">{module.description}</p>
                    <div className="mt-auto pt-5 text-xs font-semibold text-cyan-400">Abrir área →</div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mt-10 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
            <div className="flex items-start gap-3">
              <ChartNoAxesCombined size={20} className="mt-0.5 shrink-0 text-cyan-400" />
              <div>
                <h2 className="font-semibold text-white">Inteligência de mercado</h2>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Os módulos avançados de empresas, entidades e análises serão adicionados numa fase seguinte. Os dados já podem ser pesquisados diretamente através da pesquisa global.
                </p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-gradient-to-br from-cyan-400/10 to-slate-900/50 p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck size={20} className="mt-0.5 shrink-0 text-cyan-300" />
              <div>
                <h2 className="font-semibold text-white">{brand.name}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  Informação estruturada para apoiar decisões comerciais no mercado de contratação pública.
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="mt-10 border-t border-slate-800 py-6 text-xs text-slate-600">
          {brand.name} · {brand.slogan}
        </footer>
      </section>
    </main>
  );
}
