"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BookMarked,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Info,
  Lightbulb,
  Wrench,
} from "lucide-react";
import {
  MANUAL_DATE,
  MANUAL_VERSION,
  faq,
  glossary,
  pocket,
  resources,
  sections,
  troubleshooting,
} from "./content";
import type { Section } from "./content";

/** Converte **negrito** em <strong>. */
function RichText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index} className="font-semibold text-slate-200">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

function DataTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[480px] border-collapse text-sm">
        <thead>
          <tr className="bg-slate-950/60">
            {headers.map((header) => (
              <th
                key={header}
                className="border-b border-slate-800 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="odd:bg-slate-900/40">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border-b border-slate-800/60 px-4 py-3 align-top text-slate-400"
                >
                  {cellIndex === 0 ? (
                    <span className="font-medium text-slate-200">{cell}</span>
                  ) : (
                    <RichText text={cell} />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Callout({ tone, text }: { tone: "warning" | "info"; text: string }) {
  const isWarning = tone === "warning";
  return (
    <div
      className={`mt-4 flex gap-3 rounded-xl border p-4 text-sm leading-6 ${
        isWarning
          ? "border-amber-400/25 bg-amber-400/5 text-amber-100/80"
          : "border-cyan-400/20 bg-cyan-400/5 text-cyan-100/70"
      }`}
    >
      {isWarning ? (
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" />
      ) : (
        <Info size={18} className="mt-0.5 shrink-0 text-cyan-300" />
      )}
      <p>
        <RichText text={text} />
      </p>
    </div>
  );
}

function SectionBlock({ section }: { section: Section }) {
  return (
    <section id={`sec-${section.id}`} className="scroll-mt-24">
      <h2 className="flex items-baseline gap-3 text-2xl font-semibold text-white">
        <span className="text-cyan-400">{section.number}.</span>
        {section.title}
      </h2>

      {section.paragraphs.map((paragraph, index) => (
        <p key={index} className="mt-4 text-sm leading-7 text-slate-400">
          <RichText text={paragraph} />
        </p>
      ))}

      {section.steps ? (
        <ol className="mt-5 space-y-3">
          {section.steps.map((step, index) => (
            <li key={index} className="flex gap-3 text-sm leading-6 text-slate-300">
              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cyan-400/10 text-xs font-bold text-cyan-300">
                {index + 1}
              </span>
              <span>
                <RichText text={step} />
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {section.table ? (
        <DataTable
          headers={section.table.headers}
          rows={section.table.rows.map((row) => [row.term, row.meaning])}
        />
      ) : null}

      {section.extra ? <DataTable headers={section.extra.headers} rows={section.extra.rows} /> : null}

      {section.bullets ? (
        <ul className="mt-4 space-y-2">
          {section.bullets.map((bullet, index) => (
            <li key={index} className="flex gap-3 text-sm leading-6 text-slate-400">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan-400/70" />
              <span>
                <RichText text={bullet} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {section.callout ? <Callout tone={section.callout.tone} text={section.callout.text} /> : null}

      <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
        <p className="flex items-start gap-2 text-sm leading-6 text-slate-300">
          <BookMarked size={16} className="mt-0.5 shrink-0 text-cyan-300" />
          <span>
            <RichText text={section.summary} />
          </span>
        </p>
      </div>

      {section.pitfalls ? (
        <div className="mt-3 rounded-xl border border-rose-400/15 bg-rose-400/5 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-200">
            <CircleAlert size={14} /> Erros comuns a evitar
          </p>
          <ul className="mt-3 space-y-2">
            {section.pitfalls.map((pitfall, index) => (
              <li key={index} className="flex gap-2 text-sm leading-6 text-rose-100/70">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-300/60" />
                <span>
                  <RichText text={pitfall} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Accordion({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-slate-800 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left text-sm font-medium text-slate-200 transition hover:text-cyan-200"
      >
        {question}
        <ChevronDown
          size={17}
          className={`shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? <p className="px-4 pb-4 text-sm leading-6 text-slate-400">{answer}</p> : null}
    </div>
  );
}

export default function Manual() {
  return (
    <div className="space-y-12">
      <nav className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-400">Índice</h2>
        <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#sec-${section.id}`}
              className="text-sm text-slate-400 transition hover:text-cyan-300"
            >
              {section.number}. {section.title}
            </a>
          ))}
          <a href="#faq" className="text-sm text-slate-400 transition hover:text-cyan-300">
            16. Perguntas frequentes
          </a>
          <a href="#problemas" className="text-sm text-slate-400 transition hover:text-cyan-300">
            17. Resolução de problemas
          </a>
          <a href="#glossario" className="text-sm text-slate-400 transition hover:text-cyan-300">
            18. Glossário final
          </a>
          <a href="#contactos" className="text-sm text-slate-400 transition hover:text-cyan-300">
            19. Contactos e recursos
          </a>
          <a href="#cartao" className="text-sm font-semibold text-cyan-300">
            Cartão de bolso do comercial
          </a>
        </div>
      </nav>

      {sections.map((section) => (
        <SectionBlock key={section.id} section={section} />
      ))}

      <section id="faq" className="scroll-mt-24">
        <h2 className="flex items-baseline gap-3 text-2xl font-semibold text-white">
          <span className="text-cyan-400">16.</span> Perguntas frequentes (FAQ)
        </h2>
        <p className="mt-4 text-sm leading-7 text-slate-400">
          As dúvidas mais comuns do dia a dia. Clica numa pergunta para ver a resposta.
        </p>
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
          {faq.map((item) => (
            <Accordion key={item.question} question={item.question} answer={item.answer} />
          ))}
        </div>
      </section>

      <section id="problemas" className="scroll-mt-24">
        <h2 className="flex items-baseline gap-3 text-2xl font-semibold text-white">
          <span className="text-cyan-400">17.</span> Resolução de problemas
        </h2>
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Wrench size={16} className="text-cyan-300" />
          Confirma estados (email, comissão, atribuição) antes de abrir um ticket.
        </div>
        <DataTable
          headers={["Problema", "Causa provável", "O que fazer"]}
          rows={troubleshooting.map((row) => [row.problem, row.cause, row.action])}
        />
      </section>

      <section id="glossario" className="scroll-mt-24">
        <h2 className="flex items-baseline gap-3 text-2xl font-semibold text-white">
          <span className="text-cyan-400">18.</span> Glossário final
        </h2>
        <DataTable headers={["Termo", "Definição"]} rows={glossary.map((row) => [row.term, row.meaning])} />
      </section>

      <section id="contactos" className="scroll-mt-24">
        <h2 className="flex items-baseline gap-3 text-2xl font-semibold text-white">
          <span className="text-cyan-400">19.</span> Contactos e recursos
        </h2>
        <ul className="mt-4 space-y-2">
          {resources.map((item, index) => (
            <li key={index} className="flex gap-3 text-sm leading-6 text-slate-400">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-cyan-400/70" />
              <span>
                <RichText text={item} />
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section
        id="cartao"
        className="scroll-mt-24 rounded-2xl border border-cyan-400/25 bg-cyan-400/[0.06] p-6"
      >
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
          <Lightbulb size={16} /> Cartão de bolso do comercial
        </p>
        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-white">Os 10 passos essenciais</h3>
            <ol className="mt-3 space-y-2">
              {pocket.steps.map((step, index) => (
                <li key={index} className="flex gap-3 text-sm leading-6 text-slate-300">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-[10px] font-bold text-cyan-300">
                    {index + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-white">Regras de comissão (resumo)</h3>
              <ul className="mt-3 space-y-1.5">
                {pocket.commissionRules.map((rule) => (
                  <li key={rule} className="flex gap-2 text-sm text-slate-300">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300/60" />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Limitações do email</h3>
              <ul className="mt-3 space-y-1.5">
                {pocket.emailLimits.map((limit) => (
                  <li key={limit} className="flex gap-2 text-sm text-slate-300">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300/60" />
                    {limit}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="mt-8">
          <h3 className="text-sm font-semibold text-white">5 erros a evitar</h3>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {pocket.mistakes.map((mistake) => (
              <li key={mistake} className="flex gap-2 text-sm text-rose-100/70">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-300" />
                {mistake}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <p className="border-t border-slate-800 pt-6 text-center text-xs text-slate-600">
        Manual do Comercial — Adjudata · Versão {MANUAL_VERSION} · {MANUAL_DATE}
      </p>
    </div>
  );
}
