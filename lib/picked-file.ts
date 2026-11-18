"use client";

// Fichier choisi par la personne (CV) : vérification et copie en mémoire avant tout envoi.
//
// Sur Android, un fichier choisi depuis Drive, une messagerie ou certains gestionnaires de
// fichiers n'est qu'un lien vers le fichier : Chrome refusait de l'envoyer, et le site affichait
// « Connexion impossible ». On lit donc le fichier tout de suite et on envoie cette copie.

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

const RESUME_TYPES = new Set([
  "application/pdf",
  "application/x-pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

/** PDF ou Word : par l'extension, ou par le type donné par le téléphone (nom parfois sans extension). */
export function isResumeFile(f: File): boolean {
  if (/\.(pdf|docx)$/i.test(f.name)) return true;
  if (RESUME_TYPES.has(f.type)) return true;
  // Type inconnu et nom sans extension (certains gestionnaires de fichiers) : le serveur tranchera
  return f.type === "" && !/\.[a-z0-9]{2,5}$/i.test(f.name);
}

/**
 * Copie en mémoire du fichier choisi. Lève une erreur dont le message est le code à afficher :
 * « unsupported_file », « file_too_large » ou « file_unreadable ».
 */
export async function readPickedFile(picked: File): Promise<File> {
  if (!isResumeFile(picked)) throw new Error("unsupported_file");
  if (picked.size > MAX_RESUME_BYTES) throw new Error("file_too_large");
  let bytes: ArrayBuffer;
  try {
    bytes = await picked.arrayBuffer();
  } catch {
    throw new Error("file_unreadable");
  }
  if (bytes.byteLength === 0) throw new Error("file_unreadable");
  if (bytes.byteLength > MAX_RESUME_BYTES) throw new Error("file_too_large");
  return new File([bytes], picked.name || "cv", { type: picked.type || "application/octet-stream" });
}
