import "server-only";
import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import type { CoverLetter, ResumeStyle } from "@/lib/cv/types";
import { pdfSafe } from "@/lib/cv/compose";
import { fontFamily } from "./pdf";

// PDF de la lettre de motivation, avec le même style que le CV (police, couleur d'accent,
// alignement de l'en-tête du modèle choisi). Toujours sur une page : si le texte est long, la
// mise en page est resserrée (texte de 11 à 10 pt au plus petit), sans jamais couper de texte.

type Fields = Pick<CoverLetter, "sender" | "recipient" | "placeDate" | "subject" | "body" | "signature">;

const SIZES = [
  { body: 11, gap: 9, margin: 56, line: 1.45 },
  { body: 10.5, gap: 7, margin: 48, line: 1.4 },
  { body: 10, gap: 6, margin: 42, line: 1.35 },
];

function LetterDocument({ letter, style, size }: { letter: Fields; style: ResumeStyle; size: (typeof SIZES)[number] }) {
  const regular = fontFamily(style.bodyFont, style.font);
  const bold = fontFamily(style.headingFont ?? style.bodyFont, style.font);
  const s = StyleSheet.create({
    page: { fontFamily: regular, fontSize: size.body, lineHeight: size.line, color: style.textColor, padding: size.margin },
    name: { fontFamily: bold, fontWeight: 700, fontSize: size.body + 5, color: style.headingColor, textAlign: style.headerAlign },
    contacts: { fontSize: size.body - 1.5, color: "#6b7280", marginTop: 2, textAlign: style.headerAlign },
    rule: { borderBottomWidth: 1, borderBottomColor: style.accentColor, marginTop: 8, marginBottom: size.gap * 1.6 },
    recipient: { alignSelf: "flex-end", width: "48%", marginBottom: size.gap },
    placeDate: { textAlign: "right", marginBottom: size.gap * 1.4 },
    subject: { fontFamily: bold, fontWeight: 700, marginBottom: size.gap * 1.4 },
    paragraph: { marginBottom: size.gap, textAlign: "justify" },
    signature: { marginTop: size.gap * 1.6, fontFamily: bold, fontWeight: 700, alignSelf: "flex-end" },
  });
  const [name, ...contacts] = letter.sender;
  const paragraphs = letter.body.split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
  return (
    <Document title={letter.subject || "Lettre de motivation"} creator="CV Woo" producer="CV Woo">
      <Page size="A4" style={s.page}>
        <Text style={s.name}>{pdfSafe(name ?? "")}</Text>
        {contacts.length > 0 && <Text style={s.contacts}>{pdfSafe(contacts.join("  ·  "))}</Text>}
        <View style={s.rule} />
        <View style={s.recipient}>
          {letter.recipient
            .split("\n")
            .filter((l) => l.trim())
            .map((l, i) => (
              <Text key={i}>{pdfSafe(l)}</Text>
            ))}
        </View>
        <Text style={s.placeDate}>{pdfSafe(letter.placeDate)}</Text>
        {letter.subject && <Text style={s.subject}>{pdfSafe(letter.subject)}</Text>}
        {paragraphs.map((p, i) => (
          <Text key={i} style={s.paragraph}>
            {pdfSafe(p)}
          </Text>
        ))}
        <Text style={s.signature}>{pdfSafe(letter.signature)}</Text>
      </Page>
    </Document>
  );
}

/** PDF d'une page de la lettre : le premier réglage qui tient sur une page. */
export async function renderLetterPdf(letter: Fields, style: ResumeStyle): Promise<{ bytes: Uint8Array; pages: number }> {
  let last: { bytes: Uint8Array; pages: number } | null = null;
  for (const size of SIZES) {
    const bytes = new Uint8Array(await renderToBuffer(<LetterDocument letter={letter} style={style} size={size} />));
    const pages = (await PDFDocument.load(bytes)).getPageCount();
    last = { bytes, pages };
    if (pages <= 1) break;
  }
  return last!;
}
