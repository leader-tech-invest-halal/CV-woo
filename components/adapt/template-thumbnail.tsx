import type { ResumeStyle } from "@/lib/cv/types";

// Miniature d'un modèle de CV : une « page » au format A4 dessinée avec le style réel du modèle
// (disposition, couleurs, titres, police). Pour « Votre design », ce sont les couleurs et la
// disposition détectées dans le CV de la personne. Aucun texte réel n'y figure.

function Lines({ count, color, widths = [100, 92, 96, 70] }: { count: number; color: string; widths?: number[] }) {
  return (
    <div className="space-y-[3px]">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-[3px] rounded-full" style={{ width: `${widths[i % widths.length]}%`, background: color }} />
      ))}
    </div>
  );
}

function Heading({ style, light = false }: { style: ResumeStyle; light?: boolean }) {
  const color = light ? "#ffffff" : style.headingColor;
  return (
    <div className="mt-[7px] mb-[4px]">
      <div
        className="h-[4px] rounded-full"
        style={{ width: style.headingCase === "upper" ? "55%" : "42%", background: color, opacity: 0.9 }}
      />
      {style.headingRule && <div className="mt-[2px] h-px w-full" style={{ background: light ? "#ffffff" : style.accentColor }} />}
    </div>
  );
}

export function TemplateThumbnail({ style }: { style: ResumeStyle }) {
  const text = "#d4d4d8";
  const sidebar = style.layout !== "single";
  const darkSide = style.sidebarColor
    ? (() => {
        const n = parseInt(style.sidebarColor.slice(1), 16);
        return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 < 0.45;
      })()
    : false;

  const header = (
    <div style={{ textAlign: style.headerAlign }}>
      {/* « Aa » donne une idée de la police : avec ou sans empattement */}
      <div
        className="text-[11px] leading-none font-bold"
        style={{ color: style.headingColor, fontFamily: style.font === "serif" ? "Georgia, 'Times New Roman', serif" : "inherit" }}
      >
        Aa
      </div>
      <div
        className="mt-[4px] h-[3px] rounded-full"
        style={{ width: "45%", background: style.accentColor, marginInline: style.headerAlign === "center" ? "auto" : undefined }}
      />
      {!sidebar && (
        <div className="mt-[3px] h-[2px] rounded-full" style={{ width: "70%", background: text, marginInline: style.headerAlign === "center" ? "auto" : undefined }} />
      )}
    </div>
  );

  const main = (
    <div className="flex-1 p-[8px]">
      {header}
      <Heading style={style} />
      <Lines count={4} color={text} />
      <Heading style={style} />
      <Lines count={3} color={text} />
      <Heading style={style} />
      <Lines count={2} color={text} />
    </div>
  );

  const side = sidebar ? (
    <div className="w-[34%] p-[6px]" style={{ background: style.sidebarColor ?? "#f4f4f5" }}>
      <Heading style={style} light={darkSide} />
      <Lines count={3} color={darkSide ? "#ffffff99" : text} widths={[90, 70, 80]} />
      <Heading style={style} light={darkSide} />
      <Lines count={4} color={darkSide ? "#ffffff99" : text} widths={[80, 65, 90, 55]} />
    </div>
  ) : null;

  return (
    <div className="flex aspect-[210/297] w-full overflow-hidden rounded-sm border border-border bg-white shadow-card" aria-hidden>
      {style.layout === "sidebar-left" && side}
      {main}
      {style.layout === "sidebar-right" && side}
    </div>
  );
}
