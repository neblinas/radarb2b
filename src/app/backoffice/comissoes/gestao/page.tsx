"use client";

import Link from "next/link";
import { ArrowLeft, Check, LockKeyhole, ShieldCheck, UserPlus, X } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";
import {
  AdminOption,
  TeamEarningRow,
  approveCommission,
  attributeClient,
  cancelCommission,
  commissionKindLabel,
  commissionStatusLabel,
  fetchAdminOptions,
  fetchTeamEarnings,
  formatEuro,
  markCommissionPaid,
} from "@/lib/commercial";

const allowedRoles = new Set(["admin", "commercial_manager"]);

export default function CommissionAdminPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [rows, setRows] = useState<TeamEarningRow[]>([]);
  const [options, setOptions] = useState<AdminOption[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [attr, setAttr] = useState({ client: "", commercial: "" });
  const [attrMsg, setAttrMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const [earnings, opts] = await Promise.all([fetchTeamEarnings(), fetchAdminOptions()]);
      setRows(earnings);
      setOptions(opts);
    } catch {
      setError("Não foi possível carregar os dados de comissões. Confirma as migrações aplicadas.");
    }
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      if (!data.user || !allowedRoles.has(role)) {
        setState("denied");
        return;
      }
      await load();
      setState("allowed");
    });
  }, [load]);

  async function act(id: string, fn: (id: string) => Promise<void>) {
    setBusyId(id);
    try {
      await fn(id);
      await load();
    } catch {
      setError("A ação falhou. Tenta novamente.");
    }
    setBusyId("");
  }

  async function submitAttribution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!attr.client || !attr.commercial) return;
    setAttrMsg("");
    try {
      await attributeClient(attr.client, attr.commercial, "manual");
      setAttrMsg("Cliente atribuído e comissões recalculadas.");
      setAttr({ client: "", commercial: "" });
      await load();
    } catch {
      setAttrMsg("Não foi possível atribuir o cliente.");
    }
  }

  if (state === "loading") {
    return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  }
  if (state === "denied") {
    return (
      <main className="min-h-screen px-4 py-16 text-center text-slate-400">
        <LockKeyhole className="mx-auto text-cyan-300" size={28} />
        <p className="mt-4">Apenas admins e gestores comerciais.</p>
      </main>
    );
  }

  const clients = options.filter((o) => o.kind === "client");
  const commercials = options.filter((o) => o.kind === "commercial");

  return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <Link href="/backoffice/comissoes" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300">
        <ArrowLeft size={15} /> Ganhos
      </Link>

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Gestão comercial</p>
        <h1 className="mt-3 text-3xl font-semibold text-white">Comissões da equipa</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
          Atribui clientes a comerciais e confirma/aprova o pagamento das comissões.
        </p>
      </div>

      {error ? (
        <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">{error}</div>
      ) : null}

      <form onSubmit={submitAttribution} className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <UserPlus size={17} className="text-cyan-300" /> Atribuir cliente a um comercial
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-300">
            Cliente
            <select
              required
              value={attr.client}
              onChange={(event) => setAttr({ ...attr, client: event.target.value })}
              className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white"
            >
              <option value="">Selecionar cliente…</option>
              {clients.map((c) => (
                <option key={c.user_id} value={c.user_id}>
                  {c.email || c.user_id}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            Comercial
            <select
              required
              value={attr.commercial}
              onChange={(event) => setAttr({ ...attr, commercial: event.target.value })}
              className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white"
            >
              <option value="">Selecionar comercial…</option>
              {commercials.map((c) => (
                <option key={c.user_id} value={c.user_id}>
                  {c.email || c.user_id} {c.role === "commercial_manager" ? "(gestor)" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        {attrMsg ? <p className="mt-4 text-sm text-cyan-200">{attrMsg}</p> : null}
        <button
          type="submit"
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300"
        >
          <Check size={16} /> Atribuir e recalcular
        </button>
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-500">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-cyan-300" />
          A atribuição é feita com o teu consentimento de gestor e o recálculo é idempotente.
        </p>
      </form>

      <div className="mt-8 overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
        <div className="grid min-w-[820px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_110px_120px_170px] border-b border-slate-800 px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          <span>Beneficiário</span>
          <span>Tipo</span>
          <span>Cliente</span>
          <span>Estado</span>
          <span className="text-right">Valor</span>
          <span className="text-right">Ações</span>
        </div>
        {rows.length ? (
          rows.map((row) => (
            <div
              key={row.id}
              className="grid min-w-[820px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_110px_120px_170px] items-center border-b border-slate-800 px-5 py-4 last:border-0 text-sm"
            >
              <span className="break-all text-slate-300">{row.beneficiary_email || "—"}</span>
              <span className="text-slate-300">
                {commissionKindLabel[row.kind || ""] || row.commission_type}
                {row.level === 2 ? " · n2" : ""}
              </span>
              <span className="break-all text-slate-400">{row.client_email || "—"}</span>
              <span className="text-slate-400">{commissionStatusLabel[row.status] || row.status}</span>
              <span className="text-right font-semibold text-white">{formatEuro(row.amount)}</span>
              <span className="flex justify-end gap-2">
                {row.status === "pending" ? (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => act(row.id, approveCommission)}
                    className="rounded-lg border border-cyan-400/30 px-2.5 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-400/10 disabled:opacity-50"
                  >
                    Aprovar
                  </button>
                ) : null}
                {row.status === "pending" || row.status === "approved" ? (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => act(row.id, markCommissionPaid)}
                    className="rounded-lg bg-emerald-400 px-2.5 py-1.5 text-xs font-bold text-slate-950 hover:bg-emerald-300 disabled:opacity-50"
                  >
                    Pagar
                  </button>
                ) : null}
                {row.status !== "cancelled" && row.status !== "paid" ? (
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => act(row.id, (id) => cancelCommission(id, "cancelada pelo gestor"))}
                    className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:border-rose-400/40 hover:text-rose-300 disabled:opacity-50"
                    aria-label="Cancelar comissão"
                  >
                    <X size={14} />
                  </button>
                ) : null}
              </span>
            </div>
          ))
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">Sem movimentos de comissão.</div>
        )}
      </div>
    </BackofficeShell>
  );
}
