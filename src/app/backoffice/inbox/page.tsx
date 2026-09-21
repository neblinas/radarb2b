"use client";

import Link from "next/link";
import { ArrowLeft, Inbox, Loader2, Mail, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";
import {
  classificationLabel,
  fetchConversations,
  fetchInboundMetrics,
  fetchInboundMessages,
  fetchReplyClassifications,
  methodLabel,
  type Conversation,
  type InboundMessage,
  type ReplyClassificationRow,
} from "@/lib/inbound";

const statusLabels: Record<string, string> = {
  open: "Aberta",
  waiting: "À espera",
  closed: "Fechada",
};

export default function InboxPage() {
  const [identity, setIdentity] = useState({ email: "", role: "" });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboundMessage[]>([]);
  const [classifications, setClassifications] = useState<Record<string, ReplyClassificationRow>>({});
  const [metrics, setMetrics] = useState<{ open_conversations?: number; messages_7d?: number; needs_human?: number }>({});
  const [loading, setLoading] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (options?: { keepSelection?: boolean }) => {
      setLoading(true);
      setError("");
      const { data: userData } = await supabase.auth.getUser();
      const role = typeof userData.user?.app_metadata.role === "string" ? userData.user.app_metadata.role : "";
      setIdentity({ email: userData.user?.email || "", role });
      if (!userData.user || !["admin", "commercial", "commercial_manager"].includes(role)) {
        setError("Acesso reservado.");
        setLoading(false);
        return;
      }
      try {
        const [list, m] = await Promise.all([fetchConversations(100), fetchInboundMetrics()]);
        setConversations(list);
        setMetrics(m);
        if (!options?.keepSelection && list.length) {
          setSelected((current) => current ?? list[0].id);
        }
      } catch {
        setError("Não foi possível carregar a caixa de entrada.");
      }
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    const timer = window.setTimeout(() => {
      if (active) setLoadingThread(true);
    }, 0);
    void (async () => {
      try {
        const msgs = await fetchInboundMessages(selected);
        if (!active) return;
        setMessages(msgs);
        const cl: Record<string, ReplyClassificationRow> = {};
        for (const msg of msgs) {
          const rows = await fetchReplyClassifications(msg.id);
          if (rows[0]) cl[msg.id] = rows[0];
        }
        if (active) setClassifications(cl);
      } catch {
        if (active) setError("Não foi possível carregar a conversa.");
      }
      if (active) setLoadingThread(false);
    })();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [selected]);

  if (loading) return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><Loader2 className="mx-auto animate-spin" />A carregar…</main>;

  const selectedConversation = conversations.find((c) => c.id === selected) || null;

  return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <Link href="/backoffice" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Back-office</Link>
      <header className="mt-8 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">Inbound</p>
          <h1 className="mt-3 flex items-center gap-2 text-3xl font-semibold text-white"><Inbox size={28} className="text-cyan-300" /> Caixa de entrada</h1>
          <p className="mt-2 text-sm text-slate-500">Respostas às campanhas, classificadas automaticamente.</p>
        </div>
        <button onClick={() => void load({ keepSelection: true })} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-slate-200 hover:border-cyan-400/40 hover:text-cyan-200"><RefreshCw size={15} /> Atualizar</button>
      </header>

      {error ? <p className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</p> : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[["Conversas abertas", metrics.open_conversations ?? 0], ["Mensagens (7 dias)", metrics.messages_7d ?? 0], ["Requer humano", metrics.needs_human ?? 0]].map(([label, value]) => (
          <div key={label as string} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      {conversations.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center">
          <Mail size={28} className="mx-auto text-slate-600" />
          <p className="mt-4 text-sm text-slate-400">Ainda não há respostas.</p>
          <p className="mt-1 text-xs text-slate-500">Quando uma empresa responder a um email de campanha, aparece aqui.</p>
        </div>
      ) : (
        <div className="mt-8 grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-2">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setSelected(conv.id)}
                className={`w-full rounded-xl border p-4 text-left transition ${selected === conv.id ? "border-cyan-400/40 bg-cyan-400/5" : "border-slate-800 bg-slate-900/60 hover:border-slate-700"}`}
              >
                <p className="truncate text-sm font-medium text-white">{conv.contact_email}</p>
                <p className="mt-1 truncate text-xs text-slate-500">{conv.subject || "(sem assunto)"}</p>
                <p className="mt-2 text-xs text-slate-600">{statusLabels[conv.status] || conv.status} · {new Date(conv.last_message_at).toLocaleString("pt-PT")}</p>
              </button>
            ))}
          </aside>

          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            {selectedConversation ? (
              <>
                <h2 className="text-lg font-semibold text-white">{selectedConversation.contact_email}</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedConversation.subject || "(sem assunto)"}</p>
                {selectedConversation.company_id ? (
                  <Link href={`/backoffice/prospeccao/${selectedConversation.company_id}`} className="mt-2 inline-flex text-xs font-semibold text-cyan-300">Ver ficha da empresa</Link>
                ) : null}
                <div className="mt-6 space-y-4">
                  {loadingThread ? <Loader2 className="animate-spin text-slate-500" /> : messages.map((msg) => {
                    const cl = classifications[msg.id];
                    return (
                      <div key={msg.id} className="rounded-xl bg-slate-950/60 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-slate-500">{msg.from_email} · {new Date(msg.received_at).toLocaleString("pt-PT")}</p>
                          {cl ? <span className="rounded-full border border-cyan-400/20 bg-cyan-400/5 px-2.5 py-1 text-xs font-medium text-cyan-200">{classificationLabel[cl.classification] || cl.classification} · {cl.confidence}% · {methodLabel[cl.method] || cl.method}</span> : null}
                        </div>
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{msg.body_text || "(sem texto)"}</p>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : <p className="text-sm text-slate-500">Seleciona uma conversa.</p>}
          </section>
        </div>
      )}
    </BackofficeShell>
  );
}
