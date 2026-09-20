"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, LockKeyhole, ShieldAlert, Zap } from "lucide-react";
import BackofficeShell from "@/components/BackofficeShell";
import { supabase } from "@/lib/supabase";

const allowedRoles = new Set(["admin", "commercial_manager"]);

function Callout({ tone, title, children }: { tone: "warning" | "danger" | "info"; title: string; children: React.ReactNode }) {
  const styles = {
    warning: "border-amber-400/25 bg-amber-400/5 text-amber-100/80",
    danger: "border-rose-400/30 bg-rose-500/10 text-rose-100/80",
    info: "border-cyan-400/20 bg-cyan-400/5 text-cyan-100/70",
  }[tone];
  const Icon = tone === "danger" ? ShieldAlert : tone === "warning" ? AlertTriangle : CheckCircle2;
  const iconColor = tone === "danger" ? "text-rose-300" : tone === "warning" ? "text-amber-300" : "text-cyan-300";
  return (
    <div className={`mt-4 flex gap-3 rounded-xl border p-4 text-sm leading-6 ${styles}`}>
      <Icon size={18} className={`mt-0.5 shrink-0 ${iconColor}`} />
      <div>
        <p className="font-semibold">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5 flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-sm font-bold text-cyan-300">{n}</span>
      <div className="min-w-0">
        <p className="font-semibold text-white">{title}</p>
        <div className="mt-1 text-sm leading-6 text-slate-400">{children}</div>
      </div>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export default function AutopilotManualPage() {
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");
  const [identity, setIdentity] = useState({ email: "", role: "" });

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const role = typeof data.user?.app_metadata?.role === "string" ? data.user.app_metadata.role : "";
      setIdentity({ email: data.user?.email || "", role });
      setState(data.user && allowedRoles.has(role) ? "allowed" : "denied");
    });
  }, []);

  if (state === "loading") return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A validar permissões…</main>;
  if (state === "denied") return <main className="min-h-screen px-4 py-16 text-center text-slate-400"><LockKeyhole className="mx-auto text-cyan-300" size={28} /><p className="mt-4">Área reservada a gestores.</p></main>;

  return (
    <BackofficeShell email={identity.email} role={identity.role}>
      <Link href="/backoffice/autopilot" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Painel do Autopilot</Link>

      <div className="mt-8 max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Manual do Administrador</p>
        <h1 className="mt-3 flex items-center gap-3 text-3xl font-semibold text-white"><Zap className="text-cyan-300" size={26} /> Autopilot — guia de operação</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          Como manter o Autopilot sob controlo: o que faz, o que nunca faz sem ti, e como reagir. Guia de leitura
          obrigatória antes de desligares o modo simulação.
        </p>
      </div>

      <div className="mt-8 max-w-4xl space-y-6">
        <Section id="o-que-e" title="1. O que é o Autopilot">
          <p className="text-sm leading-6 text-slate-400">
            O Autopilot encontra empresas-alvo, qualifica-as, prepara mensagens personalizadas e (opcionalmente) envia
            emails de prospeção. Trabalha sozinho em segundo plano, de 5 em 5 minutos. <strong className="font-semibold text-slate-200">Nasce desligado</strong> e nunca envia nada em modo simulação.
          </p>
        </Section>

        <Section id="modos" title="2. Os três interruptores que importam">
          <ul className="mt-2 space-y-3 text-sm leading-6 text-slate-400">
            <li><strong className="font-semibold text-slate-200">Autopilot ligado</strong> — o motor funciona (procura, qualifica, prepara).</li>
            <li><strong className="font-semibold text-slate-200">Modo simulação</strong> — faz tudo <em>menos enviar</em>. É a tua rede de segurança. Deixa-o ligado até estares confiante.</li>
            <li><strong className="font-semibold text-slate-200">Outbound ligado</strong> — só com este E o modo simulação desligado é que os emails saem.</li>
          </ul>
          <Callout tone="info" title="Regra simples">
            Para <strong>enviar email real</strong> precisas de: Autopilot ligado + Outbound ligado + simulação <strong>desligada</strong>.
            Faltando um, não sai nada.
          </Callout>
        </Section>

        <Section id="aprovacao" title="3. Fila de aprovação humana">
          <p className="text-sm leading-6 text-slate-400">
            Com <strong className="font-semibold text-slate-200">“Exigir aprovação humana”</strong> ligada, cada email fica
            pendente no separador <strong className="font-semibold text-slate-200">Aprovações</strong> até tu decidires. Nada sai sem tu
            aprovares. É o método recomendado para começar.
          </p>
          <Callout tone="warning" title="Recomendação">
            Mantém a aprovação humana ligada até haver um processo definido para reclamações e pedidos de remoção.
          </Callout>
        </Section>

        <Section id="kill-switch" title="4. Kill switch — o botão de emergência">
          <p className="text-sm leading-6 text-slate-400">
            O <strong className="font-semibold text-slate-200">kill switch</strong> para <strong>toda</strong> a automação de imediato. Usa-o se algo
            correr mal: emails errados, volume estranho, dúvida. Desligar depois retoma o funcionamento.
          </p>
          <Callout tone="danger" title="Emergência">
            Em caso de dúvida, liga o kill switch primeiro e investiga depois. Não há penalização por parar.
          </Callout>
        </Section>

        <Section id="fluxo" title="5. Fluxo diário recomendado">
          <Step n={1} title="Verifica o estado">No painel: “Estado geral” deve estar Ativo; confirma se estás em simulação.</Step>
          <Step n={2} title="Vê a fila">“Fila (jobs)” mostra trabalho em espera e falhas. Falhas a subir = algo a investigar.</Step>
          <Step n={3} title="Revê aprovações">Se a aprovação humana estiver ligada, trata a fila de Aprovações.</Step>
          <Step n={4} title="Lê o Registo">O separador “Registo” mostra o que o sistema fez. É a tua fonte de verdade.</Step>
          <Step n={5} title="Confirma supressões">Em “Suppression” vês quem pediu para não ser contactado.</Step>
        </Section>

        <Section id="prospects" title="6. Sem prospects, nada acontece">
          <p className="text-sm leading-6 text-slate-400">
            O Autopilot só trabalha com empresas-alvo que existam no sistema. Se “Prospects (autopilot)” estiver a
            zero, a fila fica vazia e o Registo silencioso — <strong className="font-semibold text-slate-200">não é avaria</strong>, é falta de
            matéria-prima. As empresas entram pelo módulo de prospeção.
          </p>
        </Section>

        <Section id="erros" title="7. Erros comuns">
          <ul className="mt-2 space-y-2 text-sm leading-6 text-slate-400">
            <li>• <strong className="font-semibold text-slate-200">Ligar o outbound sem simulação confirmada</strong> — testa sempre em simulação primeiro.</li>
            <li>• <strong className="font-semibold text-slate-200">Desligar a aprovação humana demasiado cedo</strong> — mantém-na até estares seguro.</li>
            <li>• <strong className="font-semibold text-slate-200">Ignorar a fila de Aprovações</strong> — emails presos ali não saem.</li>
            <li>• <strong className="font-semibold text-slate-200">Confundir “Ativo” com “a enviar”</strong> — em simulação, Ativo <em>não</em> significa envio.</li>
            <li>• <strong className="font-semibold text-slate-200">Esperar emails sem prospects</strong> — sem empresas-alvo, não há destinatários.</li>
          </ul>
        </Section>

        <Section id="seguranca" title="8. Segurança">
          <p className="text-sm leading-6 text-slate-400">
            O painel é restrito a administradores e gestores comerciais. As decisões de envio, limites e supressão são
            todas registadas. Nenhuma ação privilegiada é executada no browser sem validação no servidor.
          </p>
        </Section>

        <p className="border-t border-slate-800 pt-6 text-center text-xs text-slate-600">
          Manual do Administrador — Adjudata · Autopilot
        </p>
      </div>
    </BackofficeShell>
  );
}
