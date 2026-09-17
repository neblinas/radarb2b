"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, Save, UserCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/login?next=/perfil"); return; }
      setForm({ name: typeof data.user.user_metadata.full_name === "string" ? data.user.user_metadata.full_name : "", phone: typeof data.user.user_metadata.phone === "string" ? data.user.user_metadata.phone : "", email: data.user.email || "" });
      setLoading(false);
    });
  }, [router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.replace("/login?next=/perfil"); return; }
    const updates: { data: { full_name: string; phone: string }; email?: string } = { data: { full_name: form.name.trim(), phone: form.phone.trim() } };
    if (form.email.trim().toLowerCase() !== (user.email || "").toLowerCase()) updates.email = form.email.trim();
    const { error: updateError } = await supabase.auth.updateUser(updates);
    if (updateError) setError("Não foi possível guardar os teus dados. Confirma o email e tenta novamente.");
    else setNotice(updates.email ? "Dados guardados. Confirma o novo email através da mensagem enviada para a tua caixa de correio." : "Dados guardados com sucesso.");
    setSaving(false);
  }

  if (loading) return <main className="min-h-screen px-4 py-16 text-center text-slate-400">A carregar perfil…</main>;

  return <main className="min-h-screen text-slate-100"><section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 lg:px-8"><Link href="/conta" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-cyan-300"><ArrowLeft size={15} /> Voltar à conta</Link><div className="mt-10"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><UserCircle size={24} /></div><p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">Dados pessoais</p><h1 className="mt-3 text-3xl font-semibold text-white">O meu perfil</h1><p className="mt-3 text-sm leading-6 text-slate-500">Atualiza apenas os dados associados à tua própria conta.</p></div>{notice ? <p className="mt-6 flex gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-200"><CheckCircle2 size={17} className="shrink-0" />{notice}</p> : null}{error ? <p className="mt-6 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</p> : null}<form onSubmit={save} className="mt-8 rounded-2xl border border-slate-800 bg-slate-900/60 p-6"><div className="grid gap-5 sm:grid-cols-2"><label className="text-sm text-slate-300">Nome<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="name" className="mt-2 h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-white outline-none focus:border-cyan-400/60" /></label><label className="text-sm text-slate-300">Telefone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} autoComplete="tel" className="mt-2 h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-white outline-none focus:border-cyan-400/60" /></label></div><label className="mt-5 block text-sm text-slate-300">Email<input required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} autoComplete="email" className="mt-2 h-12 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 text-white outline-none focus:border-cyan-400/60" /></label><p className="mt-3 text-xs leading-5 text-slate-500">Ao alterar o email, a confirmação é enviada pelo serviço de autenticação antes de a alteração ficar ativa.</p><button type="submit" disabled={saving} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-60">{saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{saving ? "A guardar…" : "Guardar alterações"}</button></form></section></main>;
}
