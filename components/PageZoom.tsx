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
