"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BellRing, BriefcaseBusiness, Building2, ClipboardList, FileCheck2, LayoutDashboard, LifeBuoy, LogOut, Menu, Search, Settings2, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { ReactNode, useState } from "react";
import { supabase } from "@/lib/supabase";

export const backofficeNav = [
  { label: "Visão geral", href: "/backoffice", icon: LayoutDashboard },
  { label: "Clientes e colaboradores", href: "/backoffice/contas", icon: Users },
  { label: "Novo colaborador", href: "/backoffice/colaboradores/novo", icon: UserPlus },
  { label: "Planos e utilização", href: "/backoffice/planos", icon: BarChart3 },
  { label: "Oportunidades", href: "/backoffice/oportunidades", icon: Building2 },
  { label: "Leads comerciais", href: "/backoffice/leads", icon: BriefcaseBusiness },
  { label: "Tickets de suporte", href: "/backoffice/tickets", icon: LifeBuoy },
  { label: "Atividade", href: "/backoffice/atividade", icon: ClipboardList },
  { label: "Verificação", href: "/backoffice/verificacao", icon: FileCheck2 },
];

export default function BackofficeShell({ children, email, role }: { children: ReactNode; email: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/acesso-comercial");
  }

  return <div className="min-h-screen bg-[#06101f] text-slate-100"><aside className={`fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-800 bg-[#071321] transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}><div className="flex h-full flex-col"><div className="flex h-20 items-center justify-between border-b border-slate-800 px-5"><Link href="/backoffice" className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300"><ShieldCheck size={20} /></span><span><strong className="block text-sm tracking-[0.16em] text-white">RADAR B2B</strong><small className="text-[10px] uppercase tracking-[0.16em] text-slate-600">Operations</small></span></Link><button type="button" className="text-slate-500 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Fechar menu"><X size={19} /></button></div><div className="border-b border-slate-800 p-4"><div className="rounded-xl bg-slate-900/80 p-3"><p className="truncate text-xs text-slate-400">{email}</p><span className="mt-2 inline-flex rounded-full border border-cyan-400/20 bg-cyan-400/5 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">{role}</span></div></div><nav className="flex-1 space-y-1 overflow-y-auto p-3">{backofficeNav.map(({ label, href, icon: Icon }) => { const active = href === "/backoffice" ? pathname === href : pathname.startsWith(href); return <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition ${active ? "bg-cyan-400/10 text-cyan-300" : "text-slate-400 hover:bg-slate-900 hover:text-white"}`}><Icon size={17} />{label}</Link>; })}</nav><div className="border-t border-slate-800 p-3"><Link href="/" className="mb-1 flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500 hover:bg-slate-900 hover:text-white"><Building2 size={17} />Abrir aplicação</Link><button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-slate-500 hover:bg-slate-900 hover:text-white"><LogOut size={17} />Terminar sessão</button></div></div></aside><div className="lg:pl-72"><header className="sticky top-0 z-40 flex h-20 items-center justify-between border-b border-slate-800/80 bg-[#06101f]/90 px-4 backdrop-blur-xl sm:px-6 lg:px-10"><button type="button" className="rounded-xl border border-slate-800 p-2 text-slate-400 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Abrir menu"><Menu size={19} /></button><div className="hidden items-center gap-3 text-sm text-slate-500 sm:flex"><Search size={16} />Pesquisar no back-office</div><div className="flex items-center gap-2"><Link href="/alertas" className="rounded-xl border border-slate-800 p-2 text-slate-500 hover:border-slate-600 hover:text-white" aria-label="Abrir alertas"><BellRing size={17} /></Link><Link href="/backoffice/verificacao" className="rounded-xl border border-slate-800 p-2 text-slate-500 hover:border-slate-600 hover:text-white" aria-label="Abrir definições de verificação"><Settings2 size={17} /></Link></div></header><main className="px-4 py-8 sm:px-6 lg:px-10">{children}</main></div></div>;
}
