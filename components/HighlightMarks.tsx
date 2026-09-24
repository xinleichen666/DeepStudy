"use client";

import { useEffect, useLayoutEffect, useMemo, useState, type RefObject } from "react";
import type { KnowledgePoint } from "@/lib/types";
import { measureExcerpt, type OverlayRect } from "@/lib/highlight-dom";
import { cn, hashHue } from "@/lib/utils";

export function HighlightMarks({
  rootRef,
  points,
  activeId,
  onSelect,
  deps,
}: {
  rootRef: RefObject<HTMLElement | null>;
  points: KnowledgePoint[];
  activeId?: string;
  onSelect: (id: string) => void;
  deps: unknown[];
}) {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const discussed = useMemo(() => points.filter((item) => item.discussed), [points]);
  const [rects, setRects] = useState<Array<OverlayRect & { id: string }>>([]);

  useLayoutEffect(() => {
    setRoot(rootRef.current);
  });

  useEffect(() => {
    if (!root) return;
    const measure = () => {
      const zoom = Number(getComputedStyle(root).zoom);
      const scale = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
      const next: Array<OverlayRect & { id: string }> = [];
      for (const point of discussed) {
        const scoped = point.page
          ? (root.querySelector(`[data-page="${point.page}"]`) as HTMLElement | null)
          : null;
        const scope = scoped ?? root;
        const boxes = measureExcerpt(scope, point.excerpt);
        const rootRect = root.getBoundingClientRect();
        const scopeRect = scope.getBoundingClientRect();
        const shiftTop = scopeRect.top - rootRect.top + root.scrollTop - scope.scrollTop;
        const shiftLeft = scopeRect.left - rootRect.left + root.scrollLeft - scope.scrollLeft;
        for (const box of boxes) {
          next.push({
            id: point.id,
            top: (box.top + (scope === root ? 0 : shiftTop)) / scale,
            left: (box.left + (scope === root ? 0 : shiftLeft)) / scale,
            width: box.width / scale,
            height: box.height / scale,
          });
        }
      }
      setRects(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, discussed, ...deps]);

  useEffect(() => {
    if (!activeId) return;
    document.querySelector(`[data-mark="${activeId}"]`)?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [activeId, rects.length]);

  return (
    <div className="mark-layer">
      {rects.map((rect, index) => (
        <button
          key={`${rect.id}-${index}`}
          type="button"
          data-mark={rect.id}
          className={cn("mark", activeId === rect.id && "active")}
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            background: `hsla(${hashHue(rect.id)}, 70%, 42%, ${activeId === rect.id ? 0.32 : 0.18})`,
          }}
          title="打开该知识点的问答"
          onClick={() => onSelect(rect.id)}
        />
      ))}
    </div>
  );
}
