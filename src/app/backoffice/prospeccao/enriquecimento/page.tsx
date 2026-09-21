"use client";

import Link from "next/link";
import { ArrowLeft, Globe2, Loader2, LockKeyhole, Search, ShieldAlert, Sparkles, Wand2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";
import {
  contactClassificationLabel,
  enrichCompany,
  enrichmentStatusLabel,
  listEnrichmentRuns,
  type EnrichmentResult,
  type EnrichmentRun,
} from "@/lib/companyEnrichment";

// Enriquecimento exige admin/commercial_manager (validado também no backend).
const allowedRoles = new Set(["admin", "commercial_manager"]);

const statusClass: Record<string, string> = {
  COMPLETED: "text-emerald-300 border-emerald-400/20 bg-emerald-400/5",
  PARTIAL: "text-amber-300 border-amber-400/20 bg-amber-400/5",
  SKIPPED: "text-slate-300 border-slate-600 bg-slate-800/40",
  FAILED: "text-rose-300 border-rose-400/20 bg-rose-400/5",
};

export default function CompanyEnrichmentPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [name, setName] = useState("");
  const [nif, setNif] = useState("");
  const [localidade, setLocalidade] = useState("");
  const [knownWebsite, setKnownWebsite] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EnrichmentResult | null>(null);
  const [history, setHistory] = useState<EnrichmentRun[]>([]);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      if (!data.user || !allowedRoles.has(role)) {
        setState("denied");
        return;
      }
      setState("allowed");
      void listEnrichmentRuns(20)
        .then((runs) => { if (active) setHistory(runs); })
        .catch(() => {});
    });
    return () => { active = false; };
  }, []);

  async function runEnrichment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setRunning(true);
    setError("");
    try {
      const data = await enrichCompany({
        name: name.trim(),
        nif: nif || null,
        localidade: localidade || null,
        knownWebsite: knownWebsite || null,
      });
      setResult(data);
      setHistory(await listEnrichmentRuns(20));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível executar o enriquecimento.");
    }
    setRunning(false);
  }

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada a admin e gestores comerciais.</p></main>;

  return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <Link href="/backoffice/prospeccao" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Prospecção</Link>
      <header className="mt-8 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Enriquecimento de empresas</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Descoberta de website e contactos públicos</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Procura o website oficial da empresa e recolhe apenas os contactos empresariais que a própria empresa apresenta publicamente. Privilegia dados abertos, o website oficial e páginas de contacto. Nunca contorna bloqueios, CAPTCHA, autenticação, robots.txt ou rate limits.
        </p>
      </header>

      <form onSubmit={runEnrichment} className="mt-8 max-w-3xl rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="flex items-center gap-2 font-semibold text-white"><Wand2 size={18} className="text-cyan-300" />Empresa a enriquecer</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-400 sm:col-span-2">Nome da empresa
            <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="ex.: Wavecom Soluções de Redes" className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
          </label>
          <label className="text-sm text-slate-400">NIF (opcional)
            <input value={nif} onChange={(event) => setNif(event.target.value)} placeholder="ex.: 501234567" className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
          </label>
          <label className="text-sm text-slate-400">Localidade (opcional)
            <input value={localidade} onChange={(event) => setLocalidade(event.target.value)} placeholder="ex.: Lisboa" className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
          </label>
          <label className="text-sm text-slate-400 sm:col-span-2">Website já conhecido (opcional)
            <input value={knownWebsite} onChange={(event) => setKnownWebsite(event.target.value)} placeholder="https://empresa.pt" className="mt-1 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-sm text-white" />
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <button type="submit" disabled={running} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">
            {running ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}Executar enriquecimento
          </button>
          <p className="text-xs text-slate-500">Execução manual. Sem envio de emails, campanhas ou automação em larga escala.</p>
        </div>
      </form>

      {error ? <p className="mt-6 max-w-3xl rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</p> : null}

      {result ? (
        <section className="mt-8 max-w-5xl space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">Estado</p>
              <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass[result.status] ?? "text-slate-300 border-slate-600 bg-slate-800/40"}`}>{enrichmentStatusLabel[result.status]}</span>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">Website</p>
              <p className="mt-2 truncate text-sm font-semibold text-white">{result.website || "—"}</p>
              {result.website_confidence != null ? <p className="mt-1 text-xs text-slate-500">Confiança {result.website_confidence}% · {result.website_method}</p> : null}
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">Páginas visitadas</p>
              <p className="mt-2 text-2xl font-semibold text-white">{result.pages_crawled}</p>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="text-xs uppercase tracking-wider text-slate-500">Contactos encontrados</p>
              <p className="mt-2 text-2xl font-semibold text-white">{result.contacts.length}</p>
            </div>
          </div>

          {result.skipped_reason ? <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">{result.skipped_reason}</p> : null}

          {result.candidates.length ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <h2 className="flex items-center gap-2 font-semibold text-white"><Globe2 size={18} className="text-cyan-300" />Candidatos de website</h2>
              <p className="mt-1 text-xs text-slate-500">Quando há dúvida entre domínios, o sistema não escolhe arbitrariamente — requer revisão humana.</p>
              <div className="mt-4 space-y-2">
                {result.candidates.map((candidate) => (
                  <div key={candidate.domain} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-950/60 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white">{candidate.url}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{candidate.reason}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-cyan-400/20 bg-cyan-400/5 px-2.5 py-1 text-xs font-semibold text-cyan-200">{candidate.confidence}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {result.contacts.length ? (
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
              <div className="border-b border-slate-800 p-5"><h2 className="flex items-center gap-2 font-semibold text-white"><Sparkles size={18} className="text-cyan-300" />Contactos empresariais recolhidos</h2><p className="mt-1 text-xs text-slate-500">Emails institucionais primeiro. Emails nominais têm prioridade muito inferior e são assinalados como potencial dado pessoal. Todos com URL de origem.</p></div>
              <div className="min-w-[720px]">
                <div className="grid grid-cols-[minmax(200px,1.4fr)_160px_130px_90px_minmax(160px,1fr)] gap-4 border-b border-slate-800 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  <span>Contacto</span><span>Classificação</span><span>Tipo</span><span>Confiança</span><span>Origem</span>
                </div>
                {result.contacts.map((contact) => (
                  <div key={`${contact.kind}:${contact.normalizado}`} className="grid grid-cols-[minmax(200px,1.4fr)_160px_130px_90px_minmax(160px,1fr)] items-start gap-4 border-b border-slate-800 px-5 py-4 last:border-0">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-white">{contact.contacto}</p>
                      {contact.note ? <p className="mt-0.5 text-xs text-amber-300">{contact.note}</p> : null}
                    </div>
                    <span className="text-sm text-slate-300">{contactClassificationLabel[contact.classification]}</span>
                    <span className="text-sm text-slate-400">{contact.kind === "email" ? "Email" : "Telefone"}</span>
                    <span className="text-sm font-semibold text-cyan-200">{contact.confidence}%</span>
                    <a href={contact.sourceUrl} target="_blank" rel="noreferrer" className="truncate text-xs text-cyan-300">{contact.sourceUrl}</a>
                  </div>
                ))}
              </div>
            </div>
          ) : result.status === "COMPLETED" ? (
            <p className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-500">Nenhum contacto empresarial público encontrado nas páginas visitadas.</p>
          ) : null}
        </section>
      ) : null}

      <section className="mt-8 max-w-5xl rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="font-semibold text-white">Execuções recentes</h2>
        {history.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="pb-3">Data</th><th className="pb-3">Empresa</th><th className="pb-3">Website</th><th className="pb-3">Estado</th><th className="pb-3">Páginas</th><th className="pb-3">Emails</th><th className="pb-3">Telefones</th></tr>
              </thead>
              <tbody className="text-slate-300">
                {history.map((run) => (
                  <tr key={run.id} className="border-t border-slate-800">
                    <td className="py-3">{new Date(run.created_at).toLocaleString("pt-PT")}</td>
                    <td className="py-3 truncate">{run.target_name}</td>
                    <td className="py-3 truncate">{run.domain || "—"}</td>
                    <td className="py-3"><span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusClass[run.status] ?? "text-slate-300 border-slate-600 bg-slate-800/40"}`}>{enrichmentStatusLabel[run.status]}</span></td>
                    <td className="py-3">{run.pages_crawled}</td>
                    <td className="py-3 text-emerald-300">{run.emails_found}</td>
                    <td className="py-3">{run.phones_found}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="mt-4 text-sm text-slate-500">Ainda não há execuções registadas.</p>}
      </section>

      <div className="mt-6 flex max-w-5xl items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm leading-6 text-slate-500">
        <ShieldAlert size={19} className="mt-0.5 shrink-0 text-amber-300" />
        <p>Proteções ativas: SSRF (bloqueio de localhost, IPs privados e endpoints de metadata), apenas HTTP/HTTPS, redirects no mesmo domínio, timeouts, limite de tamanho de resposta, rate limiting, respeito por robots.txt e user-agent identificável. Só são recolhidos contactos empresariais publicamente apresentados no website oficial.</p>
      </div>
    </BackofficeShell>
  );
}
