"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function SupabaseTest() {
  const [status, setStatus] = useState("A testar ligação ao Supabase...");

  useEffect(() => {
    async function testConnection() {
      const { count, error } = await supabase
        .from("cpvs")
        .select("id", { count: "exact", head: true });

      if (error) {
        setStatus(`ERRO: ${error.message}`);
        return;
      }

      setStatus(`SUPABASE OK — CPVs encontrados: ${count ?? 0}`);
    }

    testConnection();
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
      <div className="rounded-xl border border-slate-700 bg-slate-900 px-8 py-6">
        <h1 className="text-xl font-semibold mb-2">Radar B2B</h1>
        <p className="text-slate-300">{status}</p>
      </div>
    </main>
  );
}
