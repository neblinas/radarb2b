"use client";

import Link from "next/link";



import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

import {
  BarChart3,
  Building2,
  FileText,
  LayoutDashboard,
  Search,
  Settings,
  ShieldCheck,
  Trophy,
  Users,
} from "lucide-react";

const initialKpis = [
  {
    label: "Procedimentos",
    value: "â€”",
    icon: FileText,
    detail: "concursos e procedimentos",
  },
  {
    label: "Contratos",
    value: "â€”",
    icon: FileText,
    detail: "contratos analisados",
  },
  {
    label: "Empresas",
    value: "â€”",
    icon: Building2,
    detail: "empresas identificadas",
  },
  {
    label: "Entidades",
    value: "â€”",
    icon: Users,
    detail: "compradores pÃºblicos",
  },
];

const modules = [
  {
    title: "Procedimentos",
    description: "Pesquisa concursos, consultas e outros procedimentos de contrataÃ§Ã£o.",
    icon: FileText,
  },
  {
    title: "Empresas",
    description: "Analisa concorrentes, vencedores e histÃ³rico de participaÃ§Ã£o.",
    icon: Building2,
  },
  {
    title: "Entidades Compradoras",
    description: "Descobre quem compra, quanto compra e em que Ã¡reas.",
    icon: Users,
  },
  {
    title: "Oportunidades",
    description: "Identifica padrÃµes de compra e potenciais oportunidades comerciais.",
    icon: Trophy,
  },
];

export default function Home() {
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
        tables.map((table) =>
          supabase.from(table).select("id", { count: "exact", head: true })
        )
      );

      setKpis((current) =>
        current.map((kpi, index) => ({
          ...kpi,
          value: results[index].error
            ? "â€”"
            : (results[index].count ?? 0).toLocaleString("pt-PT"),
        }))
      );
    }

    loadKpis();
  }, []);

  useEffect(() => {
    const term = search.trim();

    if (!term) {
      setSearchResults({ procedures: [], companies: [], entities: [], cpvs: [] });
      return;
    }

    const timer = setTimeout(async () => {
      const pattern = `%${term}%`;

      const [procedures, companies, entities, cpvs] = await Promise.all([
        supabase
          .from("procedures")
          .select("id, object, procedure_type")
          .or(`object.ilike.${pattern},description.ilike.${pattern}`)
          .limit(5),

        supabase
          .from("companies")
          .select("id, name, nif")
          .or(`name.ilike.${pattern},nif.ilike.${pattern}`)
          .limit(5),

        supabase
          .from("entities")
          .select("id, name, nif")
          .or(`name.ilike.${pattern},nif.ilike.${pattern}`)
          .limit(5),

        supabase
          .from("cpvs")
          .select("id, cpv_code, description")
          .or(`cpv_code.ilike.${pattern},description.ilike.${pattern}`)
          .limit(5),
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
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-950 lg:flex lg:flex-col">
          <div className="border-b border-slate-800 px-6 py-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-400">
                <ShieldCheck size={22} />
              </div>
              <div>
                <div className="text-lg font-bold tracking-tight">RADAR B2B</div>
                <div className="text-xs text-slate-500">Public Procurement Intelligence</div>
              </div>
            </div>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-5">
            <div className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Principal
            </div>

            <a className="flex items-center gap-3 rounded-xl bg-cyan-500/10 px-3 py-2.5 text-sm font-medium text-cyan-400" href="#">
              <LayoutDashboard size={18} />
              Dashboard
            </a>

            <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-white" href="#">
              <Search size={18} />
              Pesquisa
            </a>

            <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-white" href="#">
              <FileText size={18} />
              Procedimentos
            </a>

            <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-white" href="#">
              <Building2 size={18} />
              Empresas
            </a>

            <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-white" href="#">
              <Users size={18} />
              Entidades
            </a>

            <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-400 transition hover:bg-slate-900 hover:text-white" href="#">
              <BarChart3 size={18} />
              Análises
            </a>
          </nav>

          <div className="border-t border-slate-800 p-3">
            <a className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-500 transition hover:bg-slate-900 hover:text-slate-300" href="#">
              <Settings size={18} />
              A minha conta
            </a>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-slate-800 bg-slate-950/95 px-5 py-5 backdrop-blur sm:px-8">
            <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                  Radar B2B
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
                  Inteligência de contratação pública
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Encontra compradores, concorrentes, vencedores e oportunidades.
                </p>
              </div>

              <div className="hidden rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-right sm:block">
                <div className="text-[10px] uppercase tracking-wider text-slate-600">
                  Base de dados
                </div>
                <div className="text-sm font-semibold text-slate-300">
                  Portugal Â· 2024
                </div>
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-7xl space-y-8 px-5 py-7 sm:px-8">
            <section>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar empresa, entidade, procedimento, CPV..."
                  className="h-14 w-full rounded-2xl border border-slate-800 bg-slate-900 pl-12 pr-5 text-sm text-white outline-none placeholder:text-slate-600 transition focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10"
                />
              </div>

              {search.trim() && (
                <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/95 p-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Procedimentos
                      </p>
                      {searchResults.procedures.length ? (
                        searchResults.procedures.map((item) => (
                          <Link
                              key={item.id}
                              href={`/procedimentos/${item.id}`}
                              className="mb-2 block rounded-xl bg-slate-800/60 p-3 transition hover:bg-slate-800 hover:ring-1 hover:ring-cyan-500/30"
                            >
                              <p className="text-sm font-medium text-white">
                                {item.object || "Sem objeto"}
                              </p>
                              <p className="mt-1 text-xs text-slate-500">
                                {item.procedure_type || "Procedimento"}
                              </p>
                            </Link>
                        ))
                      ) : (
                        <p className="text-xs text-slate-600">Sem resultados.</p>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Empresas
                      </p>
                      {searchResults.companies.length ? (
                        searchResults.companies.map((item) => (
                          <div key={item.id} className="mb-2 rounded-xl bg-slate-800/60 p-3">
                            <p className="text-sm font-medium text-white">
                              {item.name || "Sem nome"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              NIF {item.nif || "â€”"}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-600">Sem resultados.</p>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Entidades
                      </p>
                      {searchResults.entities.length ? (
                        searchResults.entities.map((item) => (
                          <div key={item.id} className="mb-2 rounded-xl bg-slate-800/60 p-3">
                            <p className="text-sm font-medium text-white">
                              {item.name || "Sem nome"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              NIF {item.nif || "â€”"}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-slate-600">Sem resultados.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {search.trim() && searchResults.cpvs.length > 0 && (
              <section className="mt-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/95 p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    CPVs
                  </p>

                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {searchResults.cpvs.map((item) => (
                      <div
                        key={item.id}
                        className="rounded-xl bg-slate-800/60 p-3"
                      >
                        <p className="text-sm font-semibold text-cyan-400">
                          {item.cpv_code || "Sem cÃ³digo"}
                        </p>
                        <p className="mt-1 text-xs text-slate-400">
                          {item.description || "Sem descriÃ§Ã£o"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {kpis.map((kpi) => {
                const Icon = kpi.icon;

                return (
                  <div
                    key={kpi.label}
                    className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-slate-500">{kpi.label}</p>
                        <p className="mt-2 text-3xl font-bold tracking-tight">{kpi.value}</p>
                      </div>
                      <div className="rounded-xl bg-cyan-500/10 p-2.5 text-cyan-400">
                        <Icon size={20} />
                      </div>
                    </div>
                    <p className="mt-3 text-xs text-slate-600">{kpi.detail}</p>
                  </div>
                );
              })}
            </section>

            <section>
              <div className="mb-4">
                <h2 className="text-lg font-semibold">Explorar Radar B2B</h2>
                <p className="mt-1 text-sm text-slate-500">
                  ComeÃ§a pela Ã¡rea que queres analisar.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {modules.map((module) => {
                  const Icon = module.icon;

                  return (
                    <a
                      key={module.title}
                      href="#"
                      className="group rounded-2xl border border-slate-800 bg-slate-900/50 p-5 transition hover:-translate-y-0.5 hover:border-cyan-500/30 hover:bg-slate-900"
                    >
                      <div className="flex items-start gap-4">
                        <div className="rounded-xl bg-slate-800 p-3 text-cyan-400 transition group-hover:bg-cyan-500/10">
                          <Icon size={21} />
                        </div>
                        <div>
                          <h3 className="font-semibold">{module.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-slate-500">
                            {module.description}
                          </p>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 lg:col-span-2">
                <div className="flex items-center gap-3">
                  <BarChart3 size={20} className="text-cyan-400" />
                  <div>
                    <h2 className="font-semibold">VisÃ£o do mercado</h2>
                    <p className="text-xs text-slate-600">Ãrea reservada para mÃ©tricas dinÃ¢micas</p>
                  </div>
                </div>
                <div className="mt-6 flex h-48 items-end gap-2">
                  {[35, 52, 44, 68, 58, 76, 63, 88, 72, 94, 81, 100].map((height, index) => (
                    <div key={index} className="flex-1 rounded-t-md bg-cyan-500/20">
                      <div
                        className="w-full rounded-t-md bg-cyan-500/50"
                        style={{ height: `${height}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6">
                <div className="flex items-center gap-3">
                  <Trophy size={20} className="text-cyan-400" />
                  <div>
                    <h2 className="font-semibold">Oportunidades</h2>
                    <p className="text-xs text-slate-600">PrÃ³xima fase</p>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="text-2xl font-bold">â€”</div>
                    <div className="mt-1 text-xs text-slate-600">Oportunidades identificadas</div>
                  </div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                    <div className="text-2xl font-bold">â€”</div>
                    <div className="mt-1 text-xs text-slate-600">Novos compradores</div>
                  </div>
                </div>
              </div>
            </section>

            <footer className="border-t border-slate-800 pt-6 text-xs text-slate-600">
              Radar B2B Â· Plataforma de inteligÃªncia sobre contrataÃ§Ã£o pÃºblica
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}


