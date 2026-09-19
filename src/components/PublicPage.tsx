import type { ReactNode } from "react";

export default function PublicPage({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#06101f] text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">{children}</div>
    </main>
  );
}
