"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Cookie, Settings2, X } from "lucide-react";

type Consent = {
  necessary: true;
  analytics: boolean;
  marketing: boolean;
  updatedAt: string;
};

const STORAGE_KEY = "radar_cookie_consent";

function saveConsent(analytics: boolean, marketing: boolean) {
  const consent: Consent = {
    necessary: true,
    analytics,
    marketing,
    updatedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  window.dispatchEvent(new CustomEvent("radar-cookie-consent", { detail: consent }));
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = window.localStorage.getItem(STORAGE_KEY);

      if (!stored) {
        setVisible(true);
        return;
      }

      try {
        const consent = JSON.parse(stored) as Partial<Consent>;
        setAnalytics(Boolean(consent.analytics));
        setMarketing(Boolean(consent.marketing));
      } catch {
        setVisible(true);
      }
        }, 0);

    function openSettings() {
      setSettingsOpen(true);
      setVisible(true);
    }

    window.addEventListener("radar-open-cookie-settings", openSettings);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("radar-open-cookie-settings", openSettings);
    };
  }, []);

  if (!visible) {
    return null;
  }

  function finishConsent(nextAnalytics: boolean, nextMarketing: boolean) {
    saveConsent(nextAnalytics, nextMarketing);
    setVisible(false);
  }

  return (
    <aside
      aria-label="Preferências de cookies"
      className="fixed inset-x-3 bottom-3 z-[70] max-w-3xl rounded-2xl border border-cyan-400/20 bg-slate-950/95 p-5 shadow-2xl shadow-black/40 backdrop-blur-xl sm:inset-x-auto sm:right-5 sm:bottom-5"
    >
      <div className="flex gap-3">
        <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300 sm:flex">
          <Cookie size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white">Privacidade no Radar B2B</p>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Usamos apenas armazenamento necessário para autenticação e funcionamento. Cookies de análise ou marketing só serão ativados com a tua autorização.
              </p>
            </div>
            <button
              type="button"
              aria-label="Fechar preferências de cookies"
              onClick={() => finishConsent(false, false)}
              className="rounded-lg p-1 text-slate-500 transition hover:bg-slate-800 hover:text-white"
            >
              <X size={17} />
            </button>
          </div>

          {settingsOpen ? (
            <div className="mt-4 space-y-3 border-t border-slate-800 pt-4">
              <label className="flex items-center justify-between gap-4 rounded-xl bg-slate-900/70 p-3 text-sm">
                <span>
                  <span className="block font-medium text-white">Necessários</span>
                  <span className="mt-1 block text-xs text-slate-500">Sempre ativos para sessão e segurança.</span>
                </span>
                <input type="checkbox" checked disabled aria-label="Cookies necessários ativos" />
              </label>
              <label className="flex items-center justify-between gap-4 rounded-xl bg-slate-900/70 p-3 text-sm">
                <span>
                  <span className="block font-medium text-white">Análise</span>
                  <span className="mt-1 block text-xs text-slate-500">Ajuda a perceber utilização agregada do produto.</span>
                </span>
                <input type="checkbox" checked={analytics} onChange={(event) => setAnalytics(event.target.checked)} aria-label="Cookies de análise" />
              </label>
              <label className="flex items-center justify-between gap-4 rounded-xl bg-slate-900/70 p-3 text-sm">
                <span>
                  <span className="block font-medium text-white">Marketing</span>
                  <span className="mt-1 block text-xs text-slate-500">Permite comunicações e campanhas consentidas.</span>
                </span>
                <input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} aria-label="Cookies de marketing" />
              </label>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => finishConsent(false, false)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white">
              <X size={14} /> Rejeitar opcionais
            </button>
            <button type="button" onClick={() => setSettingsOpen((current) => !current)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white">
              <Settings2 size={14} /> Preferências
            </button>
            <button type="button" onClick={() => finishConsent(true, true)} className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-300">
              <Check size={14} /> Aceitar opcionais
            </button>
            <Link href="/cookies" className="ml-auto text-xs text-cyan-300 hover:text-cyan-200">Política de cookies</Link>
          </div>
        </div>
      </div>
    </aside>
  );
}
