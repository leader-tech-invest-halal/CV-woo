"use client";

// Navigateurs intégrés aux applications (LinkedIn, Instagram, Facebook, TikTok…) : un lien ouvert
// depuis ces applications s'affiche dans leur propre navigateur, qui bloque souvent le
// téléchargement de fichiers. On le détecte pour proposer d'ouvrir la page dans Chrome ou Safari.

const IN_APP: { name: string; test: RegExp }[] = [
  { name: "LinkedIn", test: /LinkedInApp/i },
  { name: "Instagram", test: /Instagram/i },
  { name: "Facebook", test: /FBAN|FBAV|FB_IAB|FBIOS/i },
  { name: "Messenger", test: /Messenger/i },
  { name: "TikTok", test: /TikTok|musical_ly|BytedanceWebview|ByteLocale/i },
  { name: "Snapchat", test: /Snapchat/i },
  { name: "X", test: /Twitter/i },
  { name: "Line", test: /\bLine\//i },
];

export type InAppBrowser = { app: string | null; android: boolean; ios: boolean };

/** Navigateur intégré à une application, ou null dans un vrai navigateur (Chrome, Safari…). */
export function detectInAppBrowser(ua: string = typeof navigator === "undefined" ? "" : navigator.userAgent): InAppBrowser | null {
  const android = /Android/i.test(ua);
  const ios = /iPhone|iPad|iPod/i.test(ua);
  const known = IN_APP.find((x) => x.test.test(ua));
  if (known) return { app: known.name, android, ios };
  // Vue web Android générique (« ; wv) ») : autre application
  if (android && /; wv\)/.test(ua)) return { app: null, android, ios };
  return null;
}

/** Lien qui ouvre la page courante dans Chrome sur Android (depuis un navigateur intégré). */
export function chromeIntentUrl(href: string): string {
  const url = new URL(href);
  return `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(href)};end`;
}
