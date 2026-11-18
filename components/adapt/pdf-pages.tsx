"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { loadPdfjs } from "@/lib/pdfjs-browser";

/**
 * Aperçu d'un PDF dessiné page par page, à la largeur de l'écran.
 * Sur Android (et souvent sur iPhone), un PDF placé dans un cadre ne s'affiche pas :
 * on dessine donc les pages nous-mêmes. Le fichier affiché est exactement celui téléchargé.
 */
export function PdfPages({ blob, label }: { blob: Blob; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    const container = box.current;
    if (!container) return;
    setState("loading");
    (async () => {
      try {
        // PDF.js version navigateur, chargée seulement sur téléphone et tablette
        const pdfjs = await loadPdfjs();
        // Polices standard des PDF (Helvetica, Times…) servies par le site, pour un rendu exact
        const pdf = await pdfjs.getDocument({
          data: new Uint8Array(await blob.arrayBuffer()),
          standardFontDataUrl: "/pdfjs/standard_fonts/",
        }).promise;
        if (cancelled) return;
        container.replaceChildren();
        const width = container.clientWidth || 360;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        for (let n = 1; n <= pdf.numPages; n++) {
          const page = await pdf.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "block bg-white shadow-card";
          canvas.setAttribute("role", "img");
          canvas.setAttribute("aria-label", `${label} — ${n}/${pdf.numPages}`);
          const context = canvas.getContext("2d");
          if (!context) throw new Error("canvas");
          await page.render({ canvasContext: context, viewport }).promise;
          if (cancelled) return;
          container.appendChild(canvas);
        }
        setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, label]);

  return (
    <div className="p-2">
      {state === "loading" && (
        <div className="flex h-60 items-center justify-center">
          <LoaderCircle className="size-6 animate-spin text-primary" aria-hidden />
        </div>
      )}
      {state === "error" && <p className="p-4 text-sm text-muted-foreground">{label}</p>}
      <div ref={box} className="space-y-3" />
    </div>
  );
}

/** Vrai sur téléphone et tablette (écran tactile sans souris). */
export function useTouchDevice(): boolean {
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setTouch(mq.matches);
    const on = () => setTouch(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return touch;
}
