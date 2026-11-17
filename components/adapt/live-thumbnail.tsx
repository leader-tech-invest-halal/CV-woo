"use client";

import { useEffect, useRef, useState } from "react";
import type { ParsedResume } from "@/lib/cv/types";
import type { LayoutMode } from "@/lib/export/layout";
import { applyTemplate, type TemplateId } from "@/lib/export/templates";
import { exportResume } from "./api";
import { TemplateThumbnail } from "./template-thumbnail";

// Miniature d'un modèle = la vraie première page du PDF, générée avec le CV de la personne.
// Elle correspond donc exactement au fichier téléchargé. Pendant la génération, un croquis
// du modèle est affiché à la place.

const cache = new Map<string, Promise<Blob>>();

async function drawFirstPage(blob: Blob, canvas: HTMLCanvasElement, width: number) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), standardFontDataUrl: "/pdfjs/standard_fonts/" }).promise;
  const page = await pdf.getPage(1);
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: (width / base.width) * ratio });
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) return;
  await page.render({ canvasContext: context, viewport }).promise;
}

export function LiveThumbnail({
  template,
  file,
  resume,
  accepted,
  layout,
}: {
  template: TemplateId;
  file: File;
  resume: ParsedResume;
  accepted: Record<string, string>;
  layout: LayoutMode;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    const key = `${resume.fileName}|${template}|${layout}|${JSON.stringify(accepted)}`;
    if (!cache.has(key)) {
      cache.set(
        key,
        exportResume("pdf", file, resume, accepted, template, layout).then((r) => r.blob),
      );
    }
    cache
      .get(key)!
      .then(async (blob) => {
        if (cancelled || !canvas.current) return;
        await drawFirstPage(blob, canvas.current, canvas.current.parentElement?.clientWidth || 150);
        if (!cancelled) setReady(true);
      })
      .catch(() => cache.delete(key));
    return () => {
      cancelled = true;
    };
  }, [template, file, resume, accepted, layout]);

  return (
    <div className="relative aspect-[210/297] w-full overflow-hidden rounded-sm bg-white shadow-card">
      {!ready && (
        <div className="absolute inset-0">
          <TemplateThumbnail style={applyTemplate(resume.style, template)} />
        </div>
      )}
      <canvas ref={canvas} aria-hidden className={`h-full w-full ${ready ? "" : "invisible"}`} />
    </div>
  );
}
