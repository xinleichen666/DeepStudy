import { JSDOM } from "jsdom";
import { proxyImageSrc } from "./media";

const LAZY_ATTRS = [
  "data-src",
  "data-original",
  "data-original-src",
  "data-lazy-src",
  "data-lazyload",
  "data-actualsrc",
  "data-url",
  "data-imgurl",
  "data-imgsrc",
  "data-echo",
];

function promoteLazyMedia(root: ParentNode) {
  for (const img of [...root.querySelectorAll("img")]) {
    const real = pickImageUrl(img);
    if (real && !isTinyPlaceholder(real)) img.setAttribute("src", real);
    img.removeAttribute("loading");
    img.removeAttribute("srcset");
    img.removeAttribute("data-srcset");
  }
  for (const source of [...root.querySelectorAll("source")]) {
    const real = source.getAttribute("data-srcset") || source.getAttribute("data-src") || "";
    if (!real) continue;
    if (real.includes(",")) source.setAttribute("srcset", real);
    else source.setAttribute("src", real);
  }
}

function pickImageUrl(img: Element) {
  const src = img.getAttribute("src") || "";
  if (src.startsWith("/api/media")) return src;
  const lazy = firstAttr(img, LAZY_ATTRS);
  if (lazy && !isTinyPlaceholder(lazy)) return lazy;
  if (src && !isTinyPlaceholder(src)) return src;
  const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
  return srcset.split(",")[0]?.trim().split(/\s+/)[0] || "";
}

function restoreOriginalImageStyle(img: Element) {
  if (img.getAttribute("style")) return;
  const originalStyle = img.getAttribute("data-original-style");
  if (originalStyle) img.setAttribute("style", originalStyle);
}

export function prepareDocument(dom: JSDOM) {
  const doc = dom.window.document;
  revealMainContent(doc);
  promoteLazyMedia(doc);
  stripJunk(doc);
  stripLayoutSpacers(doc.documentElement);
  return doc;
}

export function rewriteHtmlForDisplay(html: string, baseUrl?: string) {
  const dom = new JSDOM(`<body>${html}</body>`, baseUrl ? { url: baseUrl } : undefined);
  const doc = dom.window.document;
  promoteLazyMedia(doc);
  materializeBackgroundImages(doc);
  stripLayoutSpacers(doc.documentElement);
  stripSpacerStyles(doc.documentElement);
  collapseEmpty(doc.body);
  for (const img of [...doc.querySelectorAll("img")]) {
    restoreOriginalImageStyle(img);
    const src = img.getAttribute("src");
    if (src?.startsWith("/api/media")) continue;
    if (!src || src.startsWith("data:")) {
      if (!src || isTinyPlaceholder(src)) img.remove();
      continue;
    }
    img.setAttribute("src", proxyImageSrc(absolutize(src, baseUrl)));
    img.removeAttribute("loading");
  }
  for (const image of [...doc.querySelectorAll("image, use")]) {
    const href = image.getAttribute("href") || image.getAttribute("xlink:href");
    if (!href || href.startsWith("data:") || href.startsWith("#")) continue;
    image.setAttribute("href", proxyImageSrc(absolutize(href, baseUrl)));
  }
  collapseEmpty(doc.body);
  return doc.body.innerHTML;
}

function revealMainContent(doc: Document) {
  for (const el of doc.querySelectorAll("#js_content, article, main, [role='main']")) {
    const node = el as HTMLElement;
    node.removeAttribute("hidden");
    const style = node.getAttribute("style") || "";
    node.setAttribute(
      "style",
      style
        .replace(/visibility\s*:\s*hidden/gi, "visibility:visible")
        .replace(/opacity\s*:\s*0(?:\.0+)?/gi, "opacity:1")
        .replace(/display\s*:\s*none/gi, "display:block"),
    );
  }
}

function materializeBackgroundImages(doc: Document) {
  for (const el of [...doc.querySelectorAll("[style]")]) {
    const style = el.getAttribute("style") || "";
    const match = style.match(/background-image\s*:\s*url\(\s*(['"]?)([^)'"]+)\1\s*\)/i);
    if (!match?.[2] || el.querySelector("img")) continue;
    const src = match[2].trim();
    if (!src || (src.startsWith("data:image") && src.length < 80)) continue;
    const img = doc.createElement("img");
    img.setAttribute("src", src);
    img.setAttribute("alt", "");
    el.insertBefore(img, el.firstChild);
  }
}

function stripLayoutSpacers(root: Element) {
  for (const svg of [...root.querySelectorAll("svg")]) {
    const viewBox = (svg.getAttribute("viewBox") || "").trim();
    const hasInk = Boolean(svg.querySelector("path, image, use, rect, circle, ellipse, line, polyline, polygon, text, foreignObject"));
    if (!hasInk && (!svg.childElementCount || /^0\s+0\s+1\s+1$/.test(viewBox))) {
      svg.remove();
    }
  }
}

function stripSpacerStyles(root: Element) {
  for (const el of [...root.querySelectorAll("[style]")]) {
    if (el.tagName === "IMG") continue;
    const style = el.getAttribute("style");
    if (!style) continue;
    const next = style
      .replace(/white-space\s*:\s*nowrap/gi, "white-space:normal")
      .replace(/min-height\s*:\s*[^;]+;?/gi, "")
      .replace(/(?:^|;)\s*height\s*:\s*[^;]+;?/gi, ";")
      .replace(/padding-(?:top|bottom)\s*:\s*(?:\d{3,}px|\d{2,}%);?/gi, "")
      .replace(/margin-(?:top|bottom)\s*:\s*\d{3,}px;?/gi, "")
      .replace(/min-width\s*:\s*[^;]+;?/gi, "")
      .replace(/(?:^|;)\s*width\s*:\s*\d{4,}px;?/gi, ";");
    if (next.trim()) el.setAttribute("style", next);
    else el.removeAttribute("style");
  }
}

function collapseEmpty(root: Element) {
  let passes = 0;
  while (passes < 8) {
    let removed = 0;
    for (const el of [...root.querySelectorAll("div, section, p, span, figure, header, footer")]) {
      if (el.querySelector("img, svg, table, math, video, canvas, pre, code, picture")) continue;
      if (/background-image\s*:\s*url\(/i.test(el.getAttribute("style") || "")) continue;
      const text = (el.textContent || "").replace(/\s+/g, "");
      if (!text) {
        el.remove();
        removed += 1;
      }
    }
    if (!removed) break;
    passes += 1;
  }
}

export function findOriginalLink(doc: Document) {
  const source = doc.querySelector<HTMLAnchorElement>("#js_view_source, #js_share_source");
  if (source?.href && !source.href.startsWith("javascript:")) return source.href;

  const byText = [...doc.querySelectorAll("a")].find((anchor) =>
    /阅读原文|查看原文|原文链接|论文原文/.test(anchor.textContent || ""),
  );
  if (byText?.href && !byText.href.startsWith("javascript:")) return byText.href;

  const scripts = [...doc.querySelectorAll("script")].map((node) => node.textContent || "").join("\n");
  const matched =
    scripts.match(/msg_source_url\s*=\s*['"]([^'"]+)['"]/) ||
    scripts.match(/sourceUrl\s*[:=]\s*['"]([^'"]+)['"]/);
  return matched?.[1];
}

function stripJunk(doc: Document) {
  for (const node of doc.querySelectorAll(
    "script, noscript, iframe, #js_profile_qrcode, #js_pc_qr_code, .qr_code_pc, .qr_code_wrap",
  )) {
    node.remove();
  }
  for (const el of [...doc.querySelectorAll("[hidden], [style]")]) {
    const style = (el.getAttribute("style") || "").toLowerCase();
    const hidden =
      el.hasAttribute("hidden") || /display\s*:\s*none/.test(style) || /visibility\s*:\s*hidden/.test(style);
    if (!hidden) continue;
    const text = (el.textContent || "").replace(/\s+/g, "");
    if (text.length > 40 || el.querySelector("img")) {
      el.removeAttribute("hidden");
      continue;
    }
    el.remove();
  }
}

function firstAttr(el: Element, names: string[]) {
  for (const name of names) {
    const value = el.getAttribute(name)?.trim();
    if (value) return value;
  }
  return "";
}

function isTinyPlaceholder(src: string) {
  return src.startsWith("data:image") && src.length < 80;
}

function absolutize(url: string, base?: string) {
  if (!base) return url;
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}
