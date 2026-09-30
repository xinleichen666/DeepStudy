"use client";

import { useEffect, useRef, useState } from "react";
import type { KnowledgePoint } from "@/lib/types";
import { HighlightMarks } from "@/components/HighlightMarks";
import { textLayerLineBoxes } from "@/lib/highlight-dom";
import { installPdfjsMapPolyfill } from "@/lib/pdfjs-map-polyfill";

type PdfModule = typeof import("pdfjs-dist");
type PdfDocument = import("pdfjs-dist").PDFDocumentProxy;

const PDF_WORKER_SRC = "/pdf.worker.entry.mjs";
const PDF_CMAP_URL = "/pdfjs/cmaps/";
const PDF_FONT_URL = "/pdfjs/standard_fonts/";
const PDF_WASM_URL = "/pdfjs/wasm/";
const PDF_ICC_URL = "/pdfjs/iccs/";

function textLayerOf(node: Node | null) {
  const element = node instanceof Element ? node : node?.parentElement;
  return element?.closest<HTMLElement>(".textLayer") ?? null;
}

function bindPdfTextSelection(root: HTMLElement) {
  let dragging = false;
  let lockedY = window.scrollY;
  let pointerY = 0;

  const paint = () => {
    root.querySelectorAll(".select-layer").forEach((layer) => layer.replaceChildren());
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const zoom = Number(getComputedStyle(root).zoom);
    const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const layers = [...root.querySelectorAll<HTMLElement>(".textLayer")];
    const anchorLayer = textLayerOf(selection.anchorNode);
    const focusLayer = textLayerOf(selection.focusNode);
    const anchorIndex = anchorLayer ? layers.indexOf(anchorLayer) : -1;
    const focusIndex = focusLayer ? layers.indexOf(focusLayer) : -1;
    if (anchorIndex < 0 && focusIndex < 0) return;
    const from = Math.min(anchorIndex < 0 ? focusIndex : anchorIndex, focusIndex < 0 ? anchorIndex : focusIndex);
    const to = Math.max(anchorIndex, focusIndex);

    for (let index = from; index <= to; index += 1) {
      const layer = layers[index];
      const overlay = layer.parentElement?.querySelector<HTMLElement>(".select-layer");
      if (!overlay) continue;
      for (const box of textLayerLineBoxes(range, layer, layer)) {
        const mark = document.createElement("div");
        mark.className = "text-select";
        mark.style.left = `${box.left / scale}px`;
        mark.style.top = `${box.top / scale}px`;
        mark.style.width = `${box.width / scale}px`;
        mark.style.height = `${box.height / scale}px`;
        overlay.append(mark);
      }
    }
  };

  const onScroll = () => {
    if (!dragging) lockedY = window.scrollY;
  };
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const element = event.target instanceof Element ? event.target : event.target instanceof Node ? event.target.parentElement : null;
    if (!element?.closest(".pdf-pages")) return;
    dragging = true;
    lockedY = window.scrollY;
    pointerY = event.clientY;
  };
  const onPointerMove = (event: PointerEvent) => {
    pointerY = event.clientY;
  };
  const onPointerUp = () => {
    dragging = false;
    lockedY = window.scrollY;
  };
  const onSelection = () => {
    paint();
    if (!dragging) return;
    const nearEdge = pointerY < 32 || pointerY > window.innerHeight - 32;
    if (nearEdge) {
      lockedY = window.scrollY;
      return;
    }
    if (Math.abs(window.scrollY - lockedY) > 40) window.scrollTo(window.scrollX, lockedY);
  };

  document.addEventListener("selectionchange", onSelection);
  window.addEventListener("scroll", onScroll, { passive: true });
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  return () => {
    document.removeEventListener("selectionchange", onSelection);
    window.removeEventListener("scroll", onScroll);
    document.removeEventListener("pointerdown", onPointerDown);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    root.querySelectorAll(".select-layer").forEach((layer) => layer.replaceChildren());
  };
}

async function loadPdfjs(): Promise<PdfModule> {
  installPdfjsMapPolyfill();
  const pdfjs: PdfModule = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
  return pdfjs;
}

export function PdfOriginalView({
  fileUrl,
  points,
  activeId,
  pageZoom = 100,
  onSelect,
}: {
  fileUrl: string;
  points: KnowledgePoint[];
  activeId?: string;
  pageZoom?: number;
  onSelect: (id: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PdfDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [width, setWidth] = useState(0);
  const [ready, setReady] = useState(false);
  const [layoutTick, setLayoutTick] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError("");
    setPageCount(0);
    (async () => {
      const pdfjs = await loadPdfjs();
      const pdf = await pdfjs.getDocument({
        url: fileUrl,
        cMapUrl: PDF_CMAP_URL,
        cMapPacked: true,
        standardFontDataUrl: PDF_FONT_URL,
        wasmUrl: PDF_WASM_URL,
        iccUrl: PDF_ICC_URL,
        useSystemFonts: false,
        disableFontFace: true,
        useWorkerFetch: true,
      }).promise;
      if (cancelled) {
        await pdf.cleanup();
        return;
      }
      await pdfRef.current?.cleanup();
      pdfRef.current = pdf;
      setPageCount(pdf.numPages);
    })().catch((item) => {
      if (!cancelled) setError(item instanceof Error ? item.message : "无法打开 PDF 原文");
    });
    return () => {
      cancelled = true;
    };
  }, [fileUrl]);

  useEffect(() => {
    const host = stageRef.current;
    if (!host) return;
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const next = Math.max(320, host.clientWidth - 48);
        setWidth((current) => (Math.abs(current - next) < 4 ? current : next));
      }, 80);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(host);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      pdfRef.current?.cleanup();
      pdfRef.current = null;
    };
  }, []);

  useEffect(() => {
    const pdf = pdfRef.current;
    const root = pagesRef.current;
    if (!pdf || !root || !pageCount || !width) return;
    let cancelled = false;
    let activeRenders = 0;
    let sawPage = false;
    let pageRatio = 1;
    let ratio = 1;
    const wanted = new Set<number>();
    const queued: number[] = [];
    const tokens = new Map<number, number>();
    const tasks = new Map<number, { cancel: () => void; promise: Promise<unknown> }>();

    const pageNodes = (number: number) => {
      const wrap = root.querySelector(`[data-page="${number}"]`) as HTMLElement | null;
      const canvas = wrap?.querySelector("canvas") as HTMLCanvasElement | null;
      const textLayer = wrap?.querySelector(".textLayer") as HTMLElement | null;
      return { wrap, canvas, textLayer };
    };

    const clearPage = (number: number) => {
      const { canvas, textLayer } = pageNodes(number);
      tasks.get(number)?.cancel();
      tasks.delete(number);
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      textLayer?.replaceChildren();
    };

    const pump = () => {
      while (activeRenders < 2 && queued.length > 0) {
        const number = queued.shift();
        if (number == null || !wanted.has(number)) continue;
        activeRenders += 1;
        void renderPage(number).finally(() => {
          activeRenders -= 1;
          pump();
        });
      }
    };

    const requestPage = (number: number) => {
      if (wanted.has(number)) return;
      wanted.add(number);
      tokens.set(number, (tokens.get(number) ?? 0) + 1);
      if (!queued.includes(number)) queued.push(number);
      pump();
    };

    const releasePage = (number: number) => {
      wanted.delete(number);
      tokens.set(number, (tokens.get(number) ?? 0) + 1);
      clearPage(number);
    };

    const renderPage = async (number: number) => {
      const token = tokens.get(number) ?? 0;
      const stale = () => cancelled || tokens.get(number) !== token;
      try {
        const pdfjs = await loadPdfjs();
        if (stale()) return;
        const page = await pdf.getPage(number);
        if (stale()) return;
        const viewport = page.getViewport({ scale: pageRatio });
        const { wrap, canvas, textLayer } = pageNodes(number);
        if (!wrap || !canvas || !textLayer || stale()) return;

        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        const pixelWidth = `${Math.floor(viewport.width)}px`;
        const pixelHeight = `${Math.floor(viewport.height)}px`;
        wrap.style.width = pixelWidth;
        wrap.style.height = pixelHeight;
        canvas.style.width = pixelWidth;
        canvas.style.height = pixelHeight;
        textLayer.replaceChildren();
        textLayer.style.width = `${Math.floor(viewport.width)}px`;
        textLayer.style.height = `${Math.floor(viewport.height)}px`;

        const task = page.render({
          canvas,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        tasks.set(number, task);
        await task.promise;
        tasks.delete(number);
        if (stale()) {
          clearPage(number);
          return;
        }

        const layer = new pdfjs.TextLayer({
          textContentSource: await page.getTextContent(),
          container: textLayer,
          viewport,
        });
        await layer.render();
        if (stale()) {
          clearPage(number);
          return;
        }
        if (!sawPage) {
          sawPage = true;
          setReady(true);
        }
        setLayoutTick((tick) => tick + 1);
      } catch (error) {
        if (stale() || (error instanceof Error && /cancel/i.test(error.message))) return;
        if (!cancelled) setError(error instanceof Error ? error.message : "PDF 渲染失败");
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const number = Number((entry.target as HTMLElement).dataset.page);
          if (!number) continue;
          if (entry.isIntersecting) requestPage(number);
          else releasePage(number);
        }
      },
      { root: null, rootMargin: "1600px 0px" },
    );

    (async () => {
      const first = await pdf.getPage(1);
      if (cancelled) return;
      pageRatio = width / first.getViewport({ scale: 1 }).width;
      const base = first.getViewport({ scale: pageRatio });
      const baseWidth = `${Math.floor(base.width)}px`;
      const baseHeight = `${Math.floor(base.height)}px`;
      const baseScale = String(base.scale);
      root.querySelectorAll<HTMLElement>(".pdf-page").forEach((wrap) => {
        wrap.style.width = baseWidth;
        wrap.style.height = baseHeight;
        wrap.style.setProperty("--scale-factor", baseScale);
      });
      if (cancelled) return;
      root.querySelectorAll(".pdf-page").forEach((page) => observer.observe(page));
      for (let number = 1; number <= pdf.numPages; number += 1) {
        if (cancelled) return;
        const page = number === 1 ? first : await pdf.getPage(number);
        const viewport = page.getViewport({ scale: pageRatio });
        const { wrap } = pageNodes(number);
        if (!wrap) continue;
        wrap.style.width = `${Math.floor(viewport.width)}px`;
        wrap.style.height = `${Math.floor(viewport.height)}px`;
        wrap.style.setProperty("--scale-factor", String(viewport.scale));
        if (number % 4 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      }
    })().catch((item) => {
      if (!cancelled) setError(item instanceof Error ? item.message : "PDF 渲染失败");
    });

    const unbindSelection = bindPdfTextSelection(root);

    return () => {
      cancelled = true;
      observer.disconnect();
      for (const task of tasks.values()) task.cancel();
      unbindSelection();
    };
  }, [pageCount, width, fileUrl]);

  const scrolledId = useRef<string | null>(null);
  const stayPut = useRef<string | null>(null);
  useEffect(() => {
    if (!activeId || scrolledId.current === activeId) return;
    if (stayPut.current === activeId) {
      scrolledId.current = activeId;
      return;
    }
    const page = points.find((item) => item.id === activeId)?.page;
    if (!page) return;
    const node = document.querySelector(`[data-page="${page}"]`);
    if (!node) return;
    scrolledId.current = activeId;
    node.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeId, points, pageCount]);

  if (error) {
    return <p className="form-error reader-error">{error}</p>;
  }

  return (
    <div className="pdf-stage" ref={stageRef}>
      <div className="pdf-pages" ref={pagesRef} style={{ zoom: pageZoom / 100 }}>
        {Array.from({ length: pageCount }, (_, index) => (
          <div key={index + 1} className="pdf-page" data-page={index + 1}>
            <canvas />
            <div className="textLayer" />
            <div className="select-layer" />
          </div>
        ))}
        <HighlightMarks
          rootRef={pagesRef}
          points={points}
          activeId={activeId}
          onSelect={onSelect}
          stayPut={stayPut}
          deps={[ready, width, pageCount, layoutTick]}
        />
      </div>
      {!ready && pageCount > 0 ? <p className="pdf-status">正在按原文页式渲染…</p> : null}
    </div>
  );
}
