"use client";

import { useEffect, useRef, useState } from "react";
import type { KnowledgePoint } from "@/lib/types";
import { HighlightMarks } from "@/components/HighlightMarks";

type PdfModule = typeof import("pdfjs-dist");
type PdfDocument = import("pdfjs-dist").PDFDocumentProxy;

export function PdfOriginalView({
  fileUrl,
  points,
  activeId,
  onSelect,
}: {
  fileUrl: string;
  points: KnowledgePoint[];
  activeId?: string;
  onSelect: (id: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<PdfDocument | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [width, setWidth] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError("");
    setPageCount(0);
    (async () => {
      const pdfjs: PdfModule = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const pdf = await pdfjs.getDocument({ url: fileUrl }).promise;
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
    setReady(false);

    (async () => {
      const pdfjs: PdfModule = await import("pdfjs-dist");
      const first = await pdf.getPage(1);
      if (cancelled) return;
      const ratio = width / first.getViewport({ scale: 1 }).width;

      for (let number = 1; number <= pdf.numPages; number += 1) {
        if (cancelled) return;
        const page = number === 1 ? first : await pdf.getPage(number);
        const viewport = page.getViewport({ scale: ratio });
        const wrap = root.querySelector(`[data-page="${number}"]`) as HTMLElement | null;
        const canvas = wrap?.querySelector("canvas") as HTMLCanvasElement | null;
        const textLayer = wrap?.querySelector(".textLayer") as HTMLElement | null;
        if (!wrap || !canvas || !textLayer) continue;

        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        wrap.style.width = `${Math.floor(viewport.width)}px`;
        wrap.style.height = `${Math.floor(viewport.height)}px`;
        textLayer.replaceChildren();
        textLayer.style.width = `${Math.floor(viewport.width)}px`;
        textLayer.style.height = `${Math.floor(viewport.height)}px`;

        await page.render({
          canvas,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        }).promise;
        if (cancelled) return;

        const layer = new pdfjs.TextLayer({
          textContentSource: await page.getTextContent(),
          container: textLayer,
          viewport,
        });
        await layer.render();
      }
      if (!cancelled) setReady(true);
    })().catch((item) => {
      if (!cancelled) setError(item instanceof Error ? item.message : "PDF 渲染失败");
    });

    return () => {
      cancelled = true;
    };
  }, [pageCount, width, fileUrl]);

  if (error) {
    return <p className="form-error reader-error">{error}</p>;
  }

  return (
    <div className="pdf-stage" ref={stageRef}>
      <div className="pdf-pages" ref={pagesRef}>
        {Array.from({ length: pageCount }, (_, index) => (
          <div key={index + 1} className="pdf-page" data-page={index + 1}>
            <canvas />
            <div className="textLayer" />
          </div>
        ))}
        <HighlightMarks
          rootRef={pagesRef}
          points={points}
          activeId={activeId}
          onSelect={onSelect}
          deps={[ready, width, pageCount]}
        />
      </div>
      {!ready && pageCount > 0 ? <p className="pdf-status">正在按原文页式渲染…</p> : null}
    </div>
  );
}
