import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { dataDir } from "./data-dir";

const MEDIA_DIR = path.join(dataDir(), "media");

export type CapturedImage = {
  url: string;
  buffer: Buffer;
  mime?: string;
};

export function canonicalImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return url.split("#")[0];
  }
}

export function mediaId(url: string) {
  return createHash("sha1").update(canonicalImageUrl(url)).digest("hex");
}

export async function saveCapturedImages(items: CapturedImage[]) {
  if (!items.length) return;
  await fs.mkdir(MEDIA_DIR, { recursive: true });
  for (const item of items) {
    if (!item.buffer?.byteLength || item.buffer.byteLength < 80) continue;
    if (item.buffer.byteLength > 12 * 1024 * 1024) continue;
    const mime = normalizeMime(item.mime, item.buffer);
    if (!mime.startsWith("image/")) continue;
    const id = mediaId(item.url);
    const filePath = path.join(MEDIA_DIR, `${id}${extFromMime(mime)}`);
    await fs.writeFile(filePath, item.buffer);
    await fs.writeFile(
      path.join(MEDIA_DIR, `${id}.json`),
      JSON.stringify({ url: canonicalImageUrl(item.url), mime }),
    );
  }
}

export async function readCachedImage(url: string) {
  const id = mediaId(url);
  const metaPath = path.join(MEDIA_DIR, `${id}.json`);
  try {
    const meta = JSON.parse(await fs.readFile(metaPath, "utf8")) as { mime?: string };
    const mime = meta.mime || "image/jpeg";
    const buffer = await fs.readFile(path.join(MEDIA_DIR, `${id}${extFromMime(mime)}`));
    return { buffer, mime };
  } catch {
    for (const ext of [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bin"]) {
      try {
        const buffer = await fs.readFile(path.join(MEDIA_DIR, `${id}${ext}`));
        return { buffer, mime: mimeFromExt(ext) };
      } catch {
        // try next
      }
    }
    return null;
  }
}

function normalizeMime(raw: string | undefined, buffer: Buffer) {
  const mime = (raw || "").split(";")[0].trim().toLowerCase();
  if (mime.startsWith("image/")) return mime;
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (buffer[0] === 0x47 && buffer[1] === 0x49) return "image/gif";
  if (buffer.slice(0, 4).toString("ascii") === "RIFF") return "image/webp";
  if (buffer.slice(0, 5).toString("ascii").includes("<?xml") || buffer.slice(0, 4).toString("ascii") === "<svg") {
    return "image/svg+xml";
  }
  return mime || "application/octet-stream";
}

function extFromMime(mime: string) {
  if (mime.includes("png")) return ".png";
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("svg")) return ".svg";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  return ".bin";
}

function mimeFromExt(ext: string) {
  if (ext === ".png") return "image/png";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "application/octet-stream";
}
