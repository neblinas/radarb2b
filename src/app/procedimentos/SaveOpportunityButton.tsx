"use client";

import { useState } from "react";
import { BookmarkCheck, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

type SaveOpportunityButtonProps = {
  procedureId: string;
};

export default function SaveOpportunityButton({
  procedureId,
}: SaveOpportunityButtonProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("Inicia sessão para guardar esta oportunidade.");
      setSaving(false);
      return;
    }

    const { error: rpcError } = await supabase.rpc("save_opportunity", {
      p_procedure_id: procedureId,
      p_notes: null,
    });

    if (rpcError) {
      setError(
        rpcError.message.includes("Limite de oportunidades")
          ? "Atingiste o limite de oportunidades guardadas do teu plano."
          : "Não foi possível guardar esta oportunidade."
      );
      setSaving(false);
      return;
    }

    setSaved(true);
    setSaving(false);
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || saved}
        className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-sm font-medium text-cyan-400 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {saving ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <BookmarkCheck size={16} />
        )}

        {saved ? "Oportunidade guardada" : "Guardar oportunidade"}
      </button>

      {error ? (
        <p className="mt-2 text-xs text-red-400">{error}</p>
      ) : null}
    </div>
  );
}
