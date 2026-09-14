"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bookmark,
  LayoutDashboard,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Trophy,
  X,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  {
    label: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    label: "Pesquisa",
    href: "/pesquisa",
    icon: Search,
  },
  {
    label: "Pesquisas guardadas",
    href: "/pesquisas-guardadas",
    icon: Bookmark,
  },
  {
    label: "Oportunidades",
    href: "/oportunidades",
    icon: Trophy,
  },
  {
    label: "Alertas",
    href: "/alertas",
    icon: Bell,
  },
];

export default function AppNavigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (pathname === "/login") {
    return null;
  }

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/";
    }

    return pathname.startsWith(href);
  };

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#08111f]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex items-center gap-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.08)]">
                <ShieldCheck size={19} />
              </div>

              <div className="leading-tight">
                <div className="text-sm font-bold tracking-[0.14em] text-white">
                  RADAR B2B
                </div>
                <div className="hidden text-[10px] uppercase tracking-[0.15em] text-slate-500 sm:block">
                  Procurement Intelligence
                </div>
              </div>
            </Link>

            <nav className="hidden items-center gap-1 lg:flex">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={[
                      "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
                      active
                        ? "bg-cyan-400/10 text-cyan-300"
                        : "text-slate-400 hover:bg-slate-800/70 hover:text-white",
                    ].join(" ")}
                  >
                    <Icon size={16} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/conta"
              className={[
                "hidden items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition sm:inline-flex",
                pathname.startsWith("/conta")
                  ? "border-cyan-400/30 bg-cyan-400/10 text-cyan-300"
                  : "border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-white",
              ].join(" ")}
            >
              <Settings size={16} />
              Conta
            </Link>

            <button
              type="button"
              aria-label="Abrir navegação"
              onClick={() => setMobileOpen((current) => !current)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/70 text-slate-300 transition hover:border-slate-700 hover:text-white lg:hidden"
            >
              {mobileOpen ? (
                <X size={19} />
              ) : (
                <Menu size={19} />
              )}
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="border-t border-slate-800/80 bg-[#08111f] lg:hidden">
            <nav className="mx-auto grid max-w-[1600px] gap-1 px-4 py-3 sm:px-6">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={[
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition",
                      active
                        ? "bg-cyan-400/10 text-cyan-300"
                        : "text-slate-400 hover:bg-slate-900 hover:text-white",
                    ].join(" ")}
                  >
                    <Icon size={17} />
                    {item.label}
                  </Link>
                );
              })}

              <div className="my-2 border-t border-slate-800" />

              <Link
                href="/conta"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-400 transition hover:bg-slate-900 hover:text-white"
              >
                <Settings size={17} />
                A minha conta
              </Link>
            </nav>
          </div>
        ) : null}
      </header>
    </>
  );
}
