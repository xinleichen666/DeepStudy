"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export const PAGE_ZOOM_KEY = "deepstudy.pageZoom";
export const PAGE_ZOOM_MIN = 50;
export const PAGE_ZOOM_MAX = 200;
export const PAGE_ZOOM_STEP = 10;
export const PAGE_ZOOM_DEFAULT = 100;

export function clampPageZoom(value: number) {
  const stepped = Math.round(value / PAGE_ZOOM_STEP) * PAGE_ZOOM_STEP;
  return Math.min(PAGE_ZOOM_MAX, Math.max(PAGE_ZOOM_MIN, stepped));
}

export function readStoredPageZoom() {
  if (typeof window === "undefined") return PAGE_ZOOM_DEFAULT;
  const raw = window.localStorage.getItem(PAGE_ZOOM_KEY);
  if (raw == null || raw === "") return PAGE_ZOOM_DEFAULT;
  const next = Number(raw);
  return Number.isFinite(next) ? clampPageZoom(next) : PAGE_ZOOM_DEFAULT;
}

export function persistPageZoom(value: number) {
  const next = clampPageZoom(value);
  window.localStorage.setItem(PAGE_ZOOM_KEY, String(next));
  return next;
}

export type PageZoomAnchor = {
  selector: string;
  ratioY: number;
  ratioX: number;
};

function zoomPages() {
  const pdfPages = [...document.querySelectorAll<HTMLElement>(".pdf-page[data-page]")];
  if (pdfPages.length) return pdfPages;
  const sections = [...document.querySelectorAll<HTMLElement>(".doc-plain[data-page]")];
  if (sections.length) return sections;
  const doc = document.querySelector<HTMLElement>(".doc-page");
  return doc ? [doc] : [];
}

export function capturePageZoomAnchor(): PageZoomAnchor | null {
  const pages = zoomPages();
  if (!pages.length) return null;
  const cy = window.innerHeight / 2;
  const cx = window.innerWidth / 2;
  let page = pages.find((item) => {
    const rect = item.getBoundingClientRect();
    return cy >= rect.top && cy <= rect.bottom;
  });
  if (!page) {
    page = pages.reduce((best, item) => {
      const rect = item.getBoundingClientRect();
      const bestRect = best.getBoundingClientRect();
      const dist = cy < rect.top ? rect.top - cy : cy - rect.bottom;
      const bestDist = cy < bestRect.top ? bestRect.top - cy : cy - bestRect.bottom;
      return dist < bestDist ? item : best;
    });
  }
  const rect = page.getBoundingClientRect();
  if (rect.height < 1 || rect.width < 1) return null;
  const pageNo = page.dataset.page;
  const selector = page.classList.contains("pdf-page")
    ? `.pdf-page[data-page="${pageNo}"]`
    : page.classList.contains("doc-plain")
      ? `.doc-plain[data-page="${pageNo}"]`
      : ".doc-page";
  return {
    selector,
    ratioY: (cy - rect.top) / rect.height,
    ratioX: (cx - rect.left) / rect.width,
  };
}

export function restorePageZoomAnchor(anchor: PageZoomAnchor | null) {
  if (!anchor) return;
  const page = document.querySelector<HTMLElement>(anchor.selector);
  if (!page) return;
  const rect = page.getBoundingClientRect();
  const dy = rect.top + anchor.ratioY * rect.height - window.innerHeight / 2;
  const dx = rect.left + anchor.ratioX * rect.width - window.innerWidth / 2;
  if (Math.abs(dy) > 1) window.scrollBy(0, dy);
  const scroller = page.closest<HTMLElement>(".pdf-stage, .doc-stage");
  if (scroller && Math.abs(dx) > 1) scroller.scrollLeft += dx;
}

export function PageZoomControls({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  className?: string;
}) {
  return (
    <div className={cn("page-zoom", className)} role="group" aria-label="页面大小">
      <span className="page-zoom-label">页面</span>
      <button
        type="button"
        className="ghost-btn page-zoom-btn"
        aria-label="缩小页面"
        disabled={value <= PAGE_ZOOM_MIN}
        onClick={() => onChange(value - PAGE_ZOOM_STEP)}
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        className="ghost-btn page-zoom-value"
        aria-label="重置为 100%"
        title="点击重置为 100%"
        onClick={() => onChange(PAGE_ZOOM_DEFAULT)}
      >
        {value}%
      </button>
      <button
        type="button"
        className="ghost-btn page-zoom-btn"
        aria-label="放大页面"
        disabled={value >= PAGE_ZOOM_MAX}
        onClick={() => onChange(value + PAGE_ZOOM_STEP)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
