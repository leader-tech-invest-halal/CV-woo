import JSZip from "jszip";
import { UserFacingError } from "./validate-file";

// Un .docx est une archive zip. Une archive piégée (« zip bomb ») de quelques Mo peut se
// décompresser en plusieurs Go et faire tomber le serveur. On refuse donc :
// - les archives avec trop de fichiers ou une taille décompressée annoncée trop grande ;
// - toute partie qui dépasse sa limite pendant la décompression (la taille annoncée peut mentir).

export const MAX_ZIP_ENTRIES = 2000;
export const MAX_ZIP_TOTAL = 60 * 1024 * 1024; // taille décompressée annoncée, toutes parties
export const MAX_PART_BYTES = 15 * 1024 * 1024; // une partie XML lue par CV Woo

type Entry = JSZip.JSZipObject & { _data?: { uncompressedSize?: number } };

/** Ouvre l'archive d'un .docx en refusant les archives anormales. */
export async function openZip(bytes: Uint8Array): Promise<JSZip> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new UserFacingError("unsupported_file");
  }
  const entries = Object.values(zip.files) as Entry[];
  if (entries.length > MAX_ZIP_ENTRIES) throw new UserFacingError("unsupported_file");
  const declared = entries.reduce((sum, e) => sum + (e._data?.uncompressedSize ?? 0), 0);
  if (declared > MAX_ZIP_TOTAL) throw new UserFacingError("unsupported_file");
  return zip;
}

/** Lit une partie de l'archive en texte, en arrêtant la décompression au-delà de la limite. */
export function readPart(file: JSZip.JSZipObject, max = MAX_PART_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    let stopped = false;
    // API interne de JSZip (stable en v3) : lecture en flux, sans tout décompresser d'avance
    const stream = (file as unknown as { internalStream: (t: "uint8array") => JSZip.JSZipStreamHelper<Uint8Array> }).internalStream("uint8array");
    stream
      .on("data", (chunk: Uint8Array) => {
        if (stopped) return;
        size += chunk.length;
        if (size > max) {
          stopped = true;
          stream.pause();
          return reject(new UserFacingError("unsupported_file"));
        }
        chunks.push(chunk);
      })
      .on("error", () => !stopped && reject(new UserFacingError("unsupported_file")))
      .on("end", () => !stopped && resolve(new TextDecoder().decode(Buffer.concat(chunks))))
      .resume();
  });
}
