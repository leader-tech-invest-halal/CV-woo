"use client";

// Chargement de PDF.js dans le navigateur, compatible avec les iPhone et iPad plus anciens
// (version « legacy » de PDF.js, prévue pour les navigateurs plus anciens).
// PDF.js utilise Promise.withResolvers, absent de Safari avant iOS 17.4 : sans cette
// compatibilité, l'aperçu du CV ne s'affichait pas sur ces appareils.

type WithResolvers = <T>() => { promise: Promise<T>; resolve: (value: T | PromiseLike<T>) => void; reject: (reason?: unknown) => void };

function polyfill() {
  const P = Promise as unknown as { withResolvers?: WithResolvers };
  if (typeof P.withResolvers === "function") return;
  P.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  } as WithResolvers;
}

export async function loadPdfjs() {
  polyfill();
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs;
}
