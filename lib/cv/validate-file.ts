import type { SourceFormat } from "./types";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export class UserFacingError extends Error {
  constructor(public code: string, public status = 400) {
    super(code);
  }
}

/** Vérifie le type réel du fichier par sa signature (pas seulement l'extension). */
export function detectFormat(bytes: Uint8Array): SourceFormat {
  if (bytes.length > MAX_FILE_BYTES) throw new UserFacingError("file_too_large", 413);
  // %PDF
  if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return "pdf";
  // PK.. (archive zip : on vérifiera ensuite la présence de word/document.xml)
  if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) return "docx";
  throw new UserFacingError("unsupported_file");
}
