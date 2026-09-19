"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Loader2, Plus, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";

type Company = { id: string; name: string | null; nif: string | null; award_count: number; total_award_value: number; inferred_size: string };
type ContactedCompany = { company_name: string; company_nif: string | null; stage: string };

const sizes = ["Todos", "micro", "pequeno", "medio", "grande"];

export default function LeadFinder() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contacted, setContacted] = useState<ContactedCompany[]>([]);
  const [query, setQuery] = useState("");
  const [size, setSize] = useState("Todos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    Promise.all([
      supabase.from("company_lead_stats").select("id, name, nif, award_count, total_award_value, inferred_size").order("award_count", { ascending: false }).limit(100),
      supabase.from("commercial_opportunities").select("company_name, company_nif, stage").limit(500),
    ]).then(([companiesResult, contactedResult]) => {
      if (companiesResult.error) setError("A pesquisa de empresas precisa da migração de leads empresariais no Supabase.");
      setCompanies((companiesResult.data ?? []) as Company[]);
      setContacted((contactedResult.data ?? []) as ContactedCompany[]);
      setLoading(false);
    });
  }, []);

  const filteredCompanies = useMemo(() => companies.filter((company) => {
    const haystack = `${company.name ?? ""} ${company.nif ?? ""}`.toLowerCase();
    return haystack.includes(query.toLowerCase()) && (size === "Todos" || company.inferred_size === size);
  }), [companies, query, size]);

  function isContacted(company: Company) {
    return contacted.find((item) => (company.nif && item.company_nif === company.nif) || item.company_name.trim().toLowerCase() === (company.name ?? "").trim().toLowerCase());
  }

  async function createCompanyLead(company: Company) {
    setSaving(company.id); setNotice("");
    const result = await supabase.rpc("create_commercial_opportunity", { p_company_name: company.name || "Empresa sem nome", p_contact_name: "A identificar", p_contact_email: null, p_note: `Lead descoberta no Adjudata. Tamanho inferido: ${company.inferred_size}. Adjudicações: ${company.award_count}. Valor agregado: ${Number(company.total_award_value).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}.` });
    if (result.error) setError("Não foi possível criar o novo contacto.");
    else { setNotice(`${company.name || "Empresa"} foi adicionada ao pipeline.`); setContacted((current) => [...current, { company_name: company.name || "", company_nif: company.nif, stage: "Novo" }]); }
    setSaving(null);
  }

  return <section className="mt-8 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.05] p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-400">Prospecção assistida</p><h2 className="mt-2 text-xl font-semibold text-white">Encontrar novas empresas</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Pesquisa empresas por atividade pública estimada. O indicador evita duplicar abordagens dentro da equipa.</p></div><div className="flex items-center gap-2 text-xs text-slate-500"><Building2 size={16} className="text-cyan-300" />{companies.length} empresas analisadas</div></div><div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]"><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar empresa ou NIF..." className="h-11 w-full rounded-xl border border-slate-800 bg-slate-950 pl-10 pr-3 text-sm text-white outline-none focus:border-cyan-400/50" /></div><select value={size} onChange={(event) => setSize(event.target.value)} className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-slate-300"><option value="Todos">Todos os tamanhos</option>{sizes.slice(1).map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></div>{notice ? <p className="mt-4 flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 size={16} />{notice}</p> : null}{error ? <p className="mt-4 text-sm text-amber-200">{error}</p> : null}<div className="mt-5 overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">{loading ? <div className="flex items-center gap-2 p-6 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />A procurar empresas…</div> : filteredCompanies.length ? filteredCompanies.slice(0, 20).map((company) => { const previous = isContacted(company); return <div key={company.id} className="grid gap-4 border-b border-slate-800 p-4 last:border-0 md:grid-cols-[minmax(0,1fr)_140px_150px_auto] md:items-center"><div><p className="font-medium text-white">{company.name || "Empresa sem nome"}</p><p className="mt-1 text-xs text-slate-500">NIF {company.nif || "—"} · {company.award_count} adjudicações · {Number(company.total_award_value).toLocaleString("pt-PT", { style: "currency", currency: "EUR" })}</p></div><span className="rounded-full border border-slate-700 px-2.5 py-1 text-center text-[11px] capitalize text-slate-300">{company.inferred_size}</span><span className={`text-xs ${previous ? "text-amber-300" : "text-emerald-300"}`}>{previous ? `Já contactada · ${previous.stage}` : "Sem contacto registado"}</span><button type="button" disabled={Boolean(previous) || saving === company.id} onClick={() => createCompanyLead(company)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-2 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-40">{saving === company.id ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}Criar contacto</button></div>; }) : <p className="p-6 text-sm text-slate-500">Sem empresas para os filtros selecionados. Confirma se a vista `company_lead_stats` já foi criada.</p>}</div></section>;
}
