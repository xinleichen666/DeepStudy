import { NextResponse } from "next/server";
import { readCachedImage, saveCapturedImages } from "@/lib/media-cache";
import { imageHeaders, isBlockedHost } from "@/lib/media";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("u") || "";
  let target: URL;
  try {
    target = new URL(raw);
    target.hash = "";
  } catch {
    return NextResponse.json({ error: "无效图片地址" }, { status: 400 });
  }
  if (!["http:", "https:"].includes(target.protocol) || isBlockedHost(target.hostname)) {
    return NextResponse.json({ error: "拒绝该地址" }, { status: 400 });
  }

  const cached = await readCachedImage(target.toString());
  if (cached) {
    return imageResponse(cached.buffer, cached.mime);
  }

  try {
    const fetched = await fetchImage(target);
    if (!fetched) {
      return NextResponse.json({ error: "图片抓取失败" }, { status: 502 });
    }
    await saveCapturedImages([{ url: target.toString(), buffer: fetched.buffer, mime: fetched.mime }]);
    return imageResponse(fetched.buffer, fetched.mime);
  } catch {
    return NextResponse.json({ error: "图片抓取失败" }, { status: 502 });
  }
}

async function fetchImage(target: URL) {
  const candidates = [target.toString()];
  if (/\/640(\?|$)/.test(target.pathname + target.search)) {
    const full = new URL(target.toString());
    full.pathname = full.pathname.replace(/\/640$/, "/0");
    candidates.push(full.toString());
  }
  for (const url of candidates) {
    const response = await fetch(url, {
      headers: imageHeaders(url),
      redirect: "follow",
    });
    if (!response.ok) continue;
    const mime = (response.headers.get("content-type") || "image/jpeg").split(";")[0].trim();
    if (!mime.startsWith("image/") && mime !== "application/octet-stream") continue;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > 12 * 1024 * 1024) continue;
    return { buffer, mime };
  }
  return null;
}

function imageResponse(data: Buffer, mime: string) {
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": mime.startsWith("image/") ? mime : "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
