"use client";

import { useTranslations } from "next-intl";
import type { Check } from "@/lib/ats/checks";

/** Texte d'un contrôle ATS, avec ses paramètres traduits (rubriques manquantes, éléments de mise en page). */
export function useCheckMessage() {
  const t = useTranslations("ats");
  return (c: Check) => {
    const p = { ...(c.params ?? {}) };
    if (c.id === "layout" && typeof p.issues === "string") {
      p.issues = p.issues.split(",").filter(Boolean).map((i) => t(`issues.${i}`)).join(", ");
    }
    if (c.id === "sections" && typeof p.missing === "string") {
      p.missing = p.missing.split(",").filter(Boolean).map((s) => t(`sectionNames.${s}`)).join(", ");
    }
    const key = c.id === "length" || c.id === "dates" ? String(p.issue) : c.status;
    return t(`checks.${c.id}.${key}`, p);
  };
}
