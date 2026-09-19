import { ImageResponse } from "next/og";
import { brand } from "@/lib/brand";

export const runtime = "edge";
export const alt = `${brand.name} — ${brand.slogan}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background:
            "radial-gradient(circle at 80% 15%, rgba(34,211,238,0.20), transparent 40%), #06101f",
          padding: "72px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "rgba(34,211,238,0.12)",
              border: "1px solid rgba(34,211,238,0.30)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#22d3ee",
              fontSize: 34,
              fontWeight: 700,
            }}
          >
            A
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              color: "#94a3b8",
              fontSize: 20,
              letterSpacing: 4,
            }}
          >
            <span style={{ color: "#ffffff", fontWeight: 700 }}>{brand.wordmark}</span>
            <span style={{ fontSize: 16, letterSpacing: 3 }}>PROCUREMENT INTELLIGENCE</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              fontSize: 74,
              fontWeight: 700,
              color: "#ffffff",
              lineHeight: 1.05,
              letterSpacing: -2,
              maxWidth: 940,
            }}
          >
            {brand.slogan}
          </div>
          <div style={{ fontSize: 30, color: "#94a3b8", maxWidth: 880, lineHeight: 1.4 }}>
            Inteligência comercial para contratação pública portuguesa — a partir dos dados públicos do BASE.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            color: "#22d3ee",
            fontSize: 24,
            fontWeight: 600,
          }}
        >
          <span>{brand.domain}</span>
          <span style={{ color: "#475569", fontSize: 20 }}>Portugal · dados BASE</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
