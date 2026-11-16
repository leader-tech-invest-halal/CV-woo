"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Download, FileText, LoaderCircle, Sparkles, Trash2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { exportResume } from "@/components/adapt/api";
import { deleteAllHistory, deleteHistoryEntry, listHistory, loadHistoryEntry, type HistoryEntry } from "./history-api";

/** Liste des CV adaptés enregistrés : retélécharger en PDF ou Word, supprimer. */
export function HistoryList() {
  const t = useTranslations("history");
  const tt = useTranslations("adapt.preview.templates");
  const format = useFormatter();
  const [items, setItems] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null); // `${id}:pdf`, `${id}:docx`, `${id}:delete`, "all"
  const [confirmAll, setConfirmAll] = useState(false);

  const load = () =>
    listHistory()
      .then((list) => {
        setItems(list);
        setError(false);
      })
      .catch(() => setError(true));

  useEffect(() => {
    load();
  }, []);

  const download = async (entry: HistoryEntry, kind: "pdf" | "docx") => {
    setBusy(`${entry.id}:${kind}`);
    setError(false);
    try {
      const { resume, accepted } = await loadHistoryEntry(entry.id);
      const { blob } = await exportResume(kind, null, resume, accepted, entry.template, entry.layout);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${entry.file_name.replace(/\.(pdf|docx)$/i, "") || "cv"}-cv-woo.${kind}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setBusy(`${id}:delete`);
    try {
      await deleteHistoryEntry(id);
      setItems((list) => list?.filter((i) => i.id !== id) ?? null);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  const removeAll = async () => {
    setBusy("all");
    try {
      await deleteAllHistory();
      setItems([]);
      setConfirmAll(false);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  };

  if (items === null && !error) {
    return (
      <div className="flex justify-center py-16">
        <LoaderCircle className="size-6 animate-spin text-primary" aria-label={t("loading")} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {t("error")}
        </p>
      )}

      {items && items.length === 0 ? (
        <Card className="flex flex-col items-center px-6 py-12 text-center">
          <span className="grid size-12 place-items-center rounded-full bg-accent text-accent-foreground">
            <FileText className="size-6" strokeWidth={1.5} aria-hidden />
          </span>
          <p className="mt-4 font-medium">{t("emptyTitle")}</p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">{t("emptyText")}</p>
          <Link href="/adapt" className={buttonClass("primary", "md", "mt-5")}>
            <Sparkles className="size-4" strokeWidth={1.75} aria-hidden />
            {t("adapt")}
          </Link>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items?.map((entry) => (
            <li key={entry.id}>
              <Card className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">{entry.offer_title}</p>
                    <p className="text-sm text-muted-foreground">
                      {[entry.company, format.dateTime(new Date(entry.created_at), { dateStyle: "medium" })].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {tt(entry.template)} · {t(`layout.${entry.layout}`)}
                      {entry.score !== null && <> · {t("score", { score: entry.score })}</>}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(entry.id)}
                    disabled={busy !== null}
                    aria-label={t("delete", { title: entry.offer_title })}
                    className="-mt-1 -mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/5 hover:text-destructive"
                  >
                    {busy === `${entry.id}:delete` ? (
                      <LoaderCircle className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="size-4" strokeWidth={1.75} aria-hidden />
                    )}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                  {(["pdf", "docx"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => download(entry, kind)}
                      disabled={busy !== null}
                      className={buttonClass(kind === "pdf" ? "primary" : "outline", "md")}
                    >
                      {busy === `${entry.id}:${kind}` ? (
                        <LoaderCircle className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Download className="size-4" strokeWidth={1.75} aria-hidden />
                      )}
                      {kind === "pdf" ? "PDF" : "Word"}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("expires", { date: format.dateTime(new Date(entry.expires_at), { dateStyle: "long" }) })}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {items && items.length > 0 && (
        <div className="pt-2">
          {!confirmAll ? (
            <button type="button" className="min-h-11 text-sm text-destructive underline underline-offset-2" onClick={() => setConfirmAll(true)}>
              {t("deleteAll")}
            </button>
          ) : (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
              <p>{t("deleteAllConfirm", { count: items.length })}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={buttonClass("ghost")} onClick={() => setConfirmAll(false)} disabled={busy !== null}>
                  {t("cancel")}
                </button>
                <button
                  type="button"
                  onClick={removeAll}
                  disabled={busy !== null}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-destructive px-4 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {busy === "all" && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                  {t("deleteAllButton")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
