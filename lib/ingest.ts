import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import DOMPurify from "isomorphic-dompurify";
import { extractText, getDocumentProxy } from "unpdf";
import { renderDocument } from "./browser";
import { findOriginalLink, prepareDocument, rewriteHtmlForDisplay } from "./html";
import { saveCapturedImages } from "./media-cache";

export type IngestResult = {
  title: string;
  text: string;
  html?: string;
  pageTexts: string[];
  pageCount: number;
  sourceUrl?: string;
  fileName?: string;
  mimeType?: string;
  pdfBuffer?: Buffer;
};

export async function ingestUrl(url: string, depth = 0): Promise<IngestResult> {
  const resolved = rewriteKnownPdf(new URL(url)).toString();
  const rendered = await renderDocument(resolved);

  if (rendered.kind === "pdf") {
    const extracted = await ingestPdfBuffer(rendered.buffer, rendered.fileName);
    return { ...extracted, sourceUrl: url };
  }

  await saveCapturedImages(rendered.images);
  const extracted = extractPage(rendered.html, rendered.finalUrl, rendered.title);
  if (depth === 0 && extracted.originalUrl) {
    try {
      const original = await ingestUrl(extracted.originalUrl, 1);
      if (original.pdfBuffer) {
        return { ...original, title: extracted.title || original.title, sourceUrl: url };
      }
    } catch {
      // 保留当前页
    }
  }
  const { originalUrl: _originalUrl, ...page } = extracted;
  return { ...page, sourceUrl: url };
}

export async function ingestPdfBuffer(buffer: Buffer, fileName = "document.pdf"): Promise<IngestResult> {
  const data = new Uint8Array(buffer);
  const pdf = await getDocumentProxy(data);
  const extracted = await extractText(pdf, { mergePages: false }).catch(async () => {
    return extractText(pdf, { mergePages: true });
  });
  const pages = normalizePages(extracted.text);
  const text = pages.join("\n\n");
  if (!text.trim()) {
    throw new Error("未能从 PDF 中提取到文本，可能是扫描版，请换用带文字层的 PDF");
  }
  return {
    title: titleFromFileName(fileName),
    text,
    pageTexts: pages,
    pageCount: pages.length,
    fileName,
    mimeType: "application/pdf",
    pdfBuffer: buffer,
  };
}

function extractPage(html: string, url: string, renderedTitle = ""): IngestResult & { originalUrl?: string } {
  const dom = new JSDOM(html, { url });
  const doc = prepareDocument(dom);
  const originalUrl = findOriginalLink(doc);
  const title = fallbackTitle(doc, url, renderedTitle);

  const readable = new Readability(cloneDocument(dom)).parse();
  let contentHtml = readable?.content || "";
  let text = cleanText(readable?.textContent || stripHtml(contentHtml));
  const main = pickMainBlock(doc);
  if (main) {
    const mainImgs = main.querySelectorAll("img, image, picture, source").length;
    const readImgs = (contentHtml.match(/<img\b/gi) || []).length;
    const mainText = cleanText(main.textContent || "");
    if (mainImgs > readImgs || (mainText.length >= 120 && mainImgs >= readImgs && mainText.length >= text.length * 0.6)) {
      contentHtml = main.innerHTML;
      if (mainText.length > text.length) text = mainText;
    }
  }

  if (text.length < 120) {
    const fallback = largestBlock(doc);
    const fallbackText = cleanText(fallback.text);
    if (fallbackText.length > text.length) {
      contentHtml = fallback.html;
      text = fallbackText;
    }
  }

  if (!text) {
    throw new Error("这个链接没有解析出正文，请更换来源或上传 PDF");
  }

  const sanitized = DOMPurify.sanitize(contentHtml, {
    USE_PROFILES: { html: true, svg: true, mathMl: true },
    ADD_TAGS: [
      "figure",
      "figcaption",
      "picture",
      "source",
      "caption",
      "colgroup",
      "col",
      "section",
      "sup",
      "sub",
      "cite",
      "math",
      "mrow",
      "mi",
      "mo",
      "mn",
      "msup",
      "msub",
      "mfrac",
      "msqrt",
      "mroot",
      "mtable",
      "mtr",
      "mtd",
      "semantics",
      "annotation",
      "svg",
      "path",
      "g",
      "use",
      "image",
    ],
    ADD_ATTR: [
      "colspan",
      "rowspan",
      "srcset",
      "sizes",
      "data-src",
      "data-original",
      "data-lazy-src",
      "viewBox",
      "xmlns",
      "xlink:href",
    ],
  });
  const display = rewriteHtmlForDisplay(sanitized, url);
  const headed = /<h1[\s>]/i.test(display)
    ? display
    : `<header class="doc-masthead"><h1>${escapeHtml(title)}</h1></header>${display}`;
  const withSource = originalUrl
    ? `${headed}<p class="doc-source-note"><a href="${escapeHtml(originalUrl)}" target="_blank" rel="noreferrer">阅读原文</a></p>`
    : headed;

  return {
    title,
    text,
    html: withSource,
    pageTexts: [text],
    pageCount: 1,
    mimeType: "text/html",
    originalUrl,
  };
}

function pickMainBlock(doc: Document) {
  return (
    doc.querySelector("#js_content") ||
    doc.querySelector("article") ||
    doc.querySelector("main") ||
    doc.querySelector("[role='main']")
  );
}

function cloneDocument(dom: JSDOM) {
  return new JSDOM(dom.serialize(), { url: dom.window.location.href }).window.document;
}

function largestBlock(doc: Document) {
  const nodes = [
    ...doc.querySelectorAll("article, main, [role='main']"),
    doc.body,
  ].filter((node): node is Element => Boolean(node));
  let best = { html: doc.body?.innerHTML || "", text: doc.body?.textContent || "" };
  for (const node of nodes) {
    const text = node.textContent || "";
    if (text.length > best.text.length) {
      best = { html: node.innerHTML, text };
    }
  }
  return best;
}

function fallbackTitle(doc: Document, url: string, renderedTitle: string) {
  return (
    doc.querySelector("meta[property='og:title']")?.getAttribute("content")?.trim() ||
    renderedTitle.trim() ||
    doc.querySelector("h1")?.textContent?.trim() ||
    doc.querySelector("title")?.textContent?.trim() ||
    url
  );
}

function normalizePages(text: string | string[] | undefined) {
  if (Array.isArray(text)) {
    return text.map((page) => cleanText(page)).filter(Boolean);
  }
  const whole = cleanText(text || "");
  return whole ? [whole] : [];
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ");
}

function cleanText(value: string) {
  return value.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "未命名 PDF";
}

function rewriteKnownPdf(url: URL) {
  if (url.hostname.includes("arxiv.org") && url.pathname.startsWith("/abs/")) {
    const next = new URL(url.toString());
    next.pathname = url.pathname.replace("/abs/", "/pdf/");
    if (!next.pathname.endsWith(".pdf")) next.pathname += ".pdf";
    return next;
  }
  return url;
}
