import { use } from "react";
import { setRequestLocale } from "next-intl/server";
import { LoginPanel } from "@/components/auth/login-panel";

export default function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale(use(params).locale);
  return (
    <div className="bg-gradient-to-b from-surface to-background">
      <div className="mx-auto max-w-[440px] px-4 py-16 sm:px-6">
        <LoginPanel />
      </div>
    </div>
  );
}
