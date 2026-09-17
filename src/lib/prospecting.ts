export type ProspectMetrics = {
  participation12Months: number;
  participationTotal: number;
  totalAwardValue: number;
  competitorCount: number;
  cpvCount: number;
  lastParticipation: string | null;
};

export function calculateProspectScore(metrics: ProspectMetrics, today = new Date()): number {
  const recentActivity = Math.min(25, Math.max(0, metrics.participation12Months) * 3);
  const frequency = Math.min(20, Math.max(0, metrics.participationTotal));
  const value = Math.min(14, Math.floor(Math.max(0, metrics.totalAwardValue) / 50000) * 2);
  const competition = Math.min(13, Math.max(0, metrics.competitorCount));
  const diversity = Math.min(8, Math.max(0, metrics.cpvCount) * 2);
  const lastParticipation = metrics.lastParticipation ? new Date(metrics.lastParticipation) : null;
  const daysSinceActivity = lastParticipation ? (today.getTime() - lastParticipation.getTime()) / 86_400_000 : Infinity;
  const recency = daysSinceActivity <= 90 ? 7 : daysSinceActivity <= 180 ? 4 : lastParticipation ? 2 : 0;
  return recentActivity + frequency + value + competition + diversity + recency;
}

export function scoreHeat(score: number): "Muito quente" | "Quente" | "Médio" | "Baixo" {
  if (score >= 80) return "Muito quente";
  if (score >= 60) return "Quente";
  if (score >= 40) return "Médio";
  return "Baixo";
}

export function normalizeEmail(value: string) { return value.trim().toLowerCase(); }
export function normalizePhone(value: string) { return value.replace(/\D/g, ""); }

export function isPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return false;
    if (["localhost", "metadata.google.internal", "169.254.169.254"].includes(host)) return false;
    return !/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host) && host !== "::1" && !host.startsWith("fe80:") && !host.startsWith("fc") && !host.startsWith("fd");
  } catch { return false; }
}
