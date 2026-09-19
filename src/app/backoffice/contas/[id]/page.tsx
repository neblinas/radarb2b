"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, BarChart3, CheckCircle2, CreditCard, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial_manager", "commercial"]);
const crmRoles = ["admin", "commercial_manager", "commercial"];
const statuses = ["active", "invited", "suspended"];
type Account = { id: string; account_status: string | null };
type Member = { role: string; status: string };
type Subscription = { plan_id: string; status: string | null; cancel_at_period_end: boolean | null };

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState("");
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [account, setAccount] = useState<Account | null>(null);
  const [member, setMember] = useState<Member>({ role: "commercial", status: "active" });
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { params.then(({ id: value }) => setId(value)); }, [params]);
  useEffect(() => {
    if (!id) return;
    supabase.auth.getUser().then(async ({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      if (!data.user || !allowedRoles.has(role)) { setState("denied"); return; }
      const [profileResult, memberResult, subscriptionResult] = await Promise.all([
        supabase.from("profiles").select("id, account_status").eq("id", id).maybeSingle(),
        supabase.from("organization_members").select("role, status").eq("user_id", id).maybeSingle(),
        supabase.from("subscriptions").select("plan_id, status, cancel_at_period_end").eq("user_id", id).maybeSingle(),
      ]);
      setAccount(profileResult.data as Account | null);
      if (memberResult.data) setMember(memberResult.data as Member);
      setSubscription(subscriptionResult.data as Subscription | null);
      setState("allowed");
    });
  }, [id]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setNotice(""); setError("");
    const { data, error: rpcError } = await supabase.rpc("update_crm_member_access", { p_user_id: id, p_role: member.role, p_status: member.status });
    if (rpcError) setError(rpcError.message.includes("Only admin") ? "Só um admin pode atribuir a role admin." : "Não foi possível guardar as permissões.");
    else { setMember(data as Member); setNotice("Permissões e estado atualizados. A alteração ficou registada na auditoria."); }
    setSaving(false);
  }

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada.</p></main>;
  if (!account) return <BackofficeShell email={identity.email} role={identity.role}><p className="text-sm text-slate-500">Cliente não encontrado ou não autorizado.</p></BackofficeShell>;

  return <BackofficeShell email={identity.email} role={identity.role}><Link href="/backoffice/contas" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Clientes e colaboradores</Link><div className="mt-8"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Ficha de cliente</p><h1 className="mt-3 break-all text-3xl font-semibold text-white">{account.id}</h1><p className="mt-3 text-sm text-slate-500">Estado da conta: {account.account_status || "active"}.</p></div>{notice ? <div className="mt-6 flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-200"><CheckCircle2 size={16} />{notice}</div> : null}{error ? <div className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</div> : null}<div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]"><form onSubmit={save} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-cyan-400">Controlo de acesso</p><h2 className="mt-2 text-xl font-semibold text-white">Editar permissões</h2></div><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 disabled:opacity-60"><Save size={16} />{saving ? "A guardar…" : "Guardar"}</button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm text-slate-300">Role comercial<select value={member.role} onChange={(event) => setMember({ ...member, role: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white">{crmRoles.map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm text-slate-300">Estado<select value={member.status} onChange={(event) => setMember({ ...member, status: event.target.value })} className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white">{statuses.map((item) => <option key={item}>{item}</option>)}</select></label></div><p className="mt-5 text-xs leading-5 text-slate-500">Alterações de role são protegidas no backend e auditadas. Preços e faturação continuam a ser geridos pelo Stripe.</p></form><aside className="space-y-4"><section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-6"><CreditCard className="text-cyan-300" size={21} /><h2 className="mt-5 font-semibold text-white">Plano atual</h2><p className="mt-3 text-sm text-slate-300">{subscription?.plan_id || "Sem subscrição"}</p><p className="mt-2 text-xs text-slate-500">{subscription?.status || "—"}{subscription?.cancel_at_period_end ? " · cancelamento agendado" : ""}</p></section><section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><BarChart3 className="text-cyan-300" size={21} /><h2 className="mt-5 font-semibold text-white">Utilização</h2><p className="mt-3 text-sm text-slate-500">Consulta quotas, pesquisas e subscrições no módulo de planos.</p><Link href="/backoffice/planos" className="mt-4 inline-flex text-xs font-semibold text-cyan-300">Abrir planos →</Link></section><section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><ShieldCheck className="text-cyan-300" size={21} /><h2 className="mt-5 font-semibold text-white">Segurança</h2><p className="mt-3 text-sm leading-6 text-slate-500">Os dados estão limitados à organização e às políticas RLS ativas.</p></section></aside></div></BackofficeShell>;
}
