import { use } from "react";
import { setRequestLocale } from "next-intl/server";
import { AdaptWizard } from "@/components/adapt/adapt-wizard";

export default function AdaptPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  return <AdaptWizard />;
}
