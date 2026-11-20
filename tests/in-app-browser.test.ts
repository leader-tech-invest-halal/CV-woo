import { describe, expect, it } from "vitest";
import { chromeIntentUrl, detectInAppBrowser } from "@/lib/in-app-browser";

// Navigateurs intégrés aux applications : le téléchargement du CV y est souvent bloqué.
// Identifiants de navigateur représentatifs (aucune donnée personnelle).

const UA = {
  linkedinAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 [LinkedInApp]/9.30.1234",
  linkedinIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [LinkedInApp]/9.30.6060",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 340.0.0.0 (iPhone14,5; iOS 17_5)",
  facebook: "Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A; wv) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/480.0.0.0;]",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeDesktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
};

describe("navigateur intégré d'une application", () => {
  it("reconnaît LinkedIn sur Android et sur iPhone", () => {
    expect(detectInAppBrowser(UA.linkedinAndroid)).toEqual({ app: "LinkedIn", android: true, ios: false });
    expect(detectInAppBrowser(UA.linkedinIos)).toEqual({ app: "LinkedIn", android: false, ios: true });
  });

  it("reconnaît Instagram et Facebook", () => {
    expect(detectInAppBrowser(UA.instagram)?.app).toBe("Instagram");
    expect(detectInAppBrowser(UA.facebook)?.app).toBe("Facebook");
  });

  it("ne dit rien dans un vrai navigateur (Chrome, Safari, ordinateur)", () => {
    expect(detectInAppBrowser(UA.chromeAndroid)).toBeNull();
    expect(detectInAppBrowser(UA.safariIos)).toBeNull();
    expect(detectInAppBrowser(UA.chromeDesktop)).toBeNull();
  });

  it("ouvre la même page dans Chrome sur Android", () => {
    expect(chromeIntentUrl("https://cv-woo.vercel.app/fr/adapt")).toBe(
      "intent://cv-woo.vercel.app/fr/adapt#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fcv-woo.vercel.app%2Ffr%2Fadapt;end",
    );
  });
});
