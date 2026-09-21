"use client";

import {
  ArrowLeft,
  AtSign,
  Check,
  Inbox,
  LockKeyhole,
  Mail,
  PenSquare,
  Send,
  Settings2,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import BackofficeShell from "@/components/BackofficeShell";
import CommercialTermsGate from "@/components/CommercialTermsGate";
import {
  COMMERCIAL_FROM_EMAIL,
  EmailDetail,
  MailSender,
  SentEmail,
  checkSuppressed,
  emailStatusLabel,
  fetchEmailDetail,
  fetchMySender,
  fetchMySentEmails,
  sendCommercialEmail,
  updateMySender,
} from "@/lib/commercial";
import { fetchFirstContactTemplate, personalizeTemplate } from "@/lib/outreach";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial", "commercial_manager"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Tab = "compose" | "outbox" | "signature";

const statusTone: Record<string, string> = {
  sent: "text-emerald-300",
  queued: "text-amber-300",
  failed: "text-rose-300",
};

export default function CommercialEmailPage() {
  return (
    <Suspense fallback={<main className="min-h-screen px-4 py-16 text-center text-slate-400">A carregar…</main>}>
      <CommercialEmailContent />
    </Suspense>
  );
}

function CommercialEmailContent() {
  const searchParams = useSearchParams();
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [tab, setTab] = useState<Tab>("compose");

  const [sender, setSender] = useState<MailSender | null>(null);
  const [outbox, setOutbox] = useState<SentEmail[]>([]);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [error, setError] = useState("");

  // Compositor — pré-preenchido por query params (vindos da prospeção/clientes).
  const [form, setForm] = useState({
    to: searchParams.get("to") || "",
    cc: "",
    subject: searchParams.get("subject") || "",
    body: searchParams.get("body") || "",
  });
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState("");
  const [suppressionNotice, setSuppressionNotice] = useState("");

  // Assinatura
  const [sig, setSig] = useState({ displayName: "", replyTo: "", signatureNote: "" });
  const [savingSig, setSavingSig] = useState(false);
  const [sigMsg, setSigMsg] = useState("");

  const loadOutbox = useCallback(async () => {
    try {
      setOutbox(await fetchMySentEmails(100));
    } catch {
      setError("Não foi possível carregar a caixa de saída.");
    }
  }, []);

  const loadSender = useCallback(async () => {
    try {
      const value = await fetchMySender();
      setSender(value);
      if (value) {
        setSig({
          displayName: value.display_name || "",
          replyTo: value.reply_to || "",
          signatureNote: value.signature_note || "",
        });
      }
    } catch {
      setError("Não foi possível carregar a tua assinatura.");
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
      await Promise.all([loadSender(), loadOutbox()]);
      setState("allowed");
    });
  }, [loadSender, loadOutbox]);

  // Pré-preenche o compositor com o template de prospeção quando vem da ficha
  // da empresa (?company=<id>). Personaliza com os dados reais (sem inventar).
  useEffect(() => {
    const companyId = searchParams.get("company");
    if (!companyId) return;
    let active = true;
    void (async () => {
      try {
        const [template, snapshot] = await Promise.all([
          fetchFirstContactTemplate(),
          supabase.rpc("prospect_snapshot", { p_company_id: companyId }),
        ]);
        if (!active || !template) return;
        const s = (snapshot.data ?? {}) as {
          name?: string; nif?: string | null; participation_12m?: number;
          award_count?: number; total_award_value?: number; cpv_codes?: string[];
        };
        const facts = {
          company: s.name || "",
          nif: s.nif ?? null,
          participation_12m: s.participation_12m ?? 0,
          awards: s.award_count ?? 0,
          value: s.total_award_value != null
            ? Number(s.total_award_value).toLocaleString("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
            : "—",
          cpv: (s.cpv_codes || []).slice(0, 4).join(", "),
        };
        setForm((prev) => ({
          ...prev,
          subject: personalizeTemplate(template.subject, facts),
          body: personalizeTemplate(template.body, facts),
        }));
      } catch {
        /* pré-preenchimento é best-effort */
      }
    })();
    return () => { active = false; };
  }, [searchParams]);

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSendMsg("");
    setError("");
    setSuppressionNotice("");
    if (!EMAIL_RE.test(form.to.trim())) {
      setSendMsg("Indica um destinatário válido.");
      return;
    }
    if (form.cc.trim() && !EMAIL_RE.test(form.cc.trim())) {
      setSendMsg("O campo CC não é um email válido.");
      return;
    }
    setSending(true);
    try {
      const to = form.to.trim();
      // Compliance: bloquear envio para contactos com opt-out/exclusão antes de
      // tentar enviar. A verificação é autoritativa no backend; aqui é um aviso
      // claro ao utilizador. Em erro, falha em segurança (não envia).
      const blocked = await checkSuppressed({ email: to });
      if (blocked) {
        setSuppressionNotice(
          "Este contacto está em opt-out/exclusão e não pode receber comunicações comerciais. O envio foi bloqueado.",
        );
        setSending(false);
        return;
      }
      await sendCommercialEmail({
        to,
        cc: form.cc.trim() || undefined,
        subject: form.subject.trim(),
        body: form.body.trim(),
      });
      setSendMsg("Email enviado com sucesso.");
      setForm({ to: "", cc: "", subject: "", body: "" });
      await loadOutbox();
      setTab("outbox");
    } catch (err) {
      setSendMsg(err instanceof Error ? err.message : "Não foi possível enviar o email.");
    } finally {
      setSending(false);
    }
  }

  async function handleSaveSignature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSigMsg("");
    if (sig.displayName.trim().length < 2) {
      setSigMsg("Indica o teu nome.");
      return;
    }
    setSavingSig(true);
    try {
      const updated = await updateMySender({
        displayName: sig.displayName.trim(),
        replyTo: sig.replyTo.trim() || undefined,
        signatureNote: sig.signatureNote.trim() || undefined,
      });
      setSender(updated);
      setSigMsg("Assinatura atualizada.");
    } catch {
      setSigMsg("Não foi possível guardar a assinatura.");
    } finally {
      setSavingSig(false);
    }
  }

  async function openDetail(id: string) {
    try {
      setDetail(await fetchEmailDetail(id));
    } catch {
      setError("Não foi possível abrir o email.");
    }
  }

  if (state === "loading") {
    return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  }
  if (state === "denied") {
    return (
      <main className="min-h-screen px-4 py-16 text-center text-slate-400">
        <LockKeyhole className="mx-auto text-cyan-300" size={28} />
        <p className="mt-4">Área reservada a comerciais.</p>
      </main>
    );
  }

  const displayName = sender?.display_name || identity.email;

  return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <CommercialTermsGate role={identity.role}>
        <Link href="/backoffice" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300">
          <ArrowLeft size={15} /> Back-office
        </Link>

        <div className="mt-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Portal comercial</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Os meus emails</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
            Envia emails de prospeção e de seguimento a clientes. Os emails saem de{" "}
            <strong className="text-slate-300">{COMMERCIAL_FROM_EMAIL}</strong> e levam a tua
            assinatura automática.
          </p>
        </div>

        {error ? (
          <div className="mt-6 rounded-xl border border-amber-400/20 bg-amber-400/5 p-4 text-sm text-amber-200">{error}</div>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          {([
            { id: "compose", label: "Novo email", icon: PenSquare },
            { id: "outbox", label: "Caixa de saída", icon: Inbox },
            { id: "signature", label: "Assinatura", icon: Settings2 },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                tab === id
                  ? "bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-400/30"
                  : "border border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>

        {tab === "compose" ? (
          <form onSubmit={handleSend} className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">
                Para
                <input
                  type="email"
                  required
                  value={form.to}
                  onChange={(e) => setForm({ ...form, to: e.target.value })}
                  placeholder="cliente@empresa.pt"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white"
                />
              </label>
              <label className="text-sm text-slate-300">
                CC (opcional)
                <input
                  type="email"
                  value={form.cc}
                  onChange={(e) => setForm({ ...form, cc: e.target.value })}
                  placeholder="colega@adjudata.pt"
                  className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white"
                />
              </label>
            </div>
            <label className="mt-4 block text-sm text-slate-300">
              Assunto
              <input
                type="text"
                required
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="Proposta de colaboração"
                className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white"
              />
            </label>
            <label className="mt-4 block text-sm text-slate-300">
              Mensagem
              <textarea
                required
                rows={9}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Escreve aqui a tua mensagem…"
                className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-3 text-white"
              />
            </label>

            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-400">
              <p className="flex items-center gap-2 font-semibold text-slate-300">
                <AtSign size={14} className="text-cyan-300" /> A tua assinatura
              </p>
              <p className="mt-2 leading-6">
                Com os melhores cumprimentos,<br />
                <strong className="text-slate-200">{displayName}</strong>
                {sender?.reply_to ? <> · {sender.reply_to}</> : null}
                <br />
                adjudata.pt
              </p>
              <p className="mt-2 text-xs text-slate-500">
                {sender?.signature_note || "Por favor não responda a este e-mail."}
              </p>
            </div>

            {sendMsg ? <p className="mt-4 text-sm text-cyan-200">{sendMsg}</p> : null}
            {suppressionNotice ? (
              <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-200">
                {suppressionNotice}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={sending}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
            >
              <Send size={16} /> {sending ? "A enviar…" : "Enviar email"}
            </button>
          </form>
        ) : null}

        {tab === "outbox" ? (
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_110px_140px] border-b border-slate-800 px-5 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              <span>Para</span>
              <span>Assunto</span>
              <span>Estado</span>
              <span className="text-right">Data</span>
            </div>
            {outbox.length ? (
              outbox.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openDetail(item.id)}
                  className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_110px_140px] items-center border-b border-slate-800 px-5 py-4 text-left text-sm last:border-0 hover:bg-slate-900/80"
                >
                  <span className="break-all text-slate-300">{item.to_email}</span>
                  <span className="truncate text-slate-400">{item.subject}</span>
                  <span className={statusTone[item.status] || "text-slate-400"}>
                    {emailStatusLabel[item.status] || item.status}
                  </span>
                  <span className="text-right text-slate-500">
                    {new Date(item.created_at).toLocaleString("pt-PT", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </button>
              ))
            ) : (
              <div className="p-8 text-center text-sm text-slate-500">
                Ainda não enviaste emails. Começa em «Novo email».
              </div>
            )}
          </div>
        ) : null}

        {tab === "signature" ? (
          <form onSubmit={handleSaveSignature} className="mt-6 max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <AtSign size={17} className="text-cyan-300" /> Assinatura automática
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Esta assinatura é acrescentada a todos os emails que enviares.
            </p>
            <label className="mt-4 block text-sm text-slate-300">
              Nome a apresentar
              <input
                type="text"
                required
                value={sig.displayName}
                onChange={(e) => setSig({ ...sig, displayName: e.target.value })}
                className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white"
              />
            </label>
            <label className="mt-4 block text-sm text-slate-300">
              Contacto (opcional)
              <input
                type="email"
                value={sig.replyTo}
                onChange={(e) => setSig({ ...sig, replyTo: e.target.value })}
                placeholder="o.teu.email@exemplo.pt"
                className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white"
              />
              <span className="mt-2 block text-xs text-slate-500">
                Se indicares, aparece na assinatura como referência de contacto.
              </span>
            </label>
            <label className="mt-4 block text-sm text-slate-300">
              Nota de rodapé
              <input
                type="text"
                value={sig.signatureNote}
                onChange={(e) => setSig({ ...sig, signatureNote: e.target.value })}
                className="mt-2 h-11 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 text-white"
              />
            </label>
            {sigMsg ? <p className="mt-4 text-sm text-cyan-200">{sigMsg}</p> : null}
            <button
              type="submit"
              disabled={savingSig}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60"
            >
              <Check size={16} /> {savingSig ? "A guardar…" : "Guardar assinatura"}
            </button>
          </form>
        ) : null}

        {detail ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4" onClick={() => setDetail(null)}>
            <div
              className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">Email enviado</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">{detail.subject}</h2>
                  <p className="mt-1 text-sm text-slate-400">Para: {detail.to_email}</p>
                  {detail.cc ? <p className="text-sm text-slate-400">CC: {detail.cc}</p> : null}
                </div>
                <button type="button" onClick={() => setDetail(null)} className="rounded-lg border border-slate-700 p-1.5 text-slate-400 hover:text-white" aria-label="Fechar">
                  <X size={16} />
                </button>
              </div>
              <div className="mt-4 flex items-center gap-3 text-xs">
                <span className={statusTone[detail.status] || "text-slate-400"}>
                  {emailStatusLabel[detail.status] || detail.status}
                </span>
                <span className="text-slate-500">
                  {new Date(detail.created_at).toLocaleString("pt-PT")}
                </span>
              </div>
              {detail.error ? (
                <p className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/5 p-3 text-sm text-rose-200">{detail.error}</p>
              ) : null}
              <div className="mt-4 rounded-xl border border-slate-800 bg-white p-4">
                <div
                  className="text-sm leading-6 text-slate-800"
                  dangerouslySetInnerHTML={{ __html: detail.rendered_body }}
                />
              </div>
            </div>
          </div>
        ) : null}

        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 text-sm leading-6 text-slate-500">
          <Mail size={19} className="mt-0.5 shrink-0 text-cyan-300" />
          <p>
            Os emails são enviados por <strong className="text-slate-300">{COMMERCIAL_FROM_EMAIL}</strong> em nome de
            Adjudata. O seguimento de respostas é feito por ti, pelos teus próprios canais — por isso incluímos a nota
            «não responda».
          </p>
        </div>
      </CommercialTermsGate>
    </BackofficeShell>
  );
}
