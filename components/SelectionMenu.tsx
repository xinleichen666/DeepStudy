"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, MessageSquareText } from "lucide-react";

type MenuState = {
  quote: string;
  x: number;
  y: number;
};

export function SelectionMenu({
  onAsk,
  asking,
}: {
  onAsk: (quote: string, question: string) => Promise<void> | void;
  asking?: boolean;
}) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [mode, setMode] = useState<"actions" | "ask">("actions");
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function hostOf(node: Node | null) {
      const el = node instanceof Element ? node : node?.parentElement;
      return el?.closest(".doc-page, .pdf-page, .article-html, .doc-plain, .kp-item, .kp-q, .reader-kps");
    }

    function placeMenu(clientX: number, clientY: number) {
      const selection = window.getSelection();
      const quote = selection?.toString().replace(/\s+/g, " ").trim() || "";
      if (quote.length < 2 || !selection?.rangeCount) {
        setMenu(null);
        return;
      }
      if (!hostOf(selection.anchorNode) && !hostOf(selection.focusNode)) {
        setMenu(null);
        return;
      }
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      setCopied(false);
      setMode("actions");
      setDraft("");
      setMenu({
        quote,
        x: Math.min(Math.max((rect.width >= 2 ? rect.left + rect.width / 2 : clientX), 140), window.innerWidth - 160),
        y: Math.min((rect.height >= 2 ? rect.bottom + 8 : clientY + 14), window.innerHeight - 120),
      });
    }

    function onMouseUp(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".select-pop, .reader-bar, .reader-topbar, .reader-history, .reader-kps, textarea, input")) return;
      const x = event.clientX;
      const y = event.clientY;
      window.setTimeout(() => placeMenu(x, y), 40);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(null);
    }

    document.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  if (!menu) return null;
  const current = menu;

  async function copyText() {
    try {
      await navigator.clipboard.writeText(current.quote);
      setCopied(true);
      window.setTimeout(() => setMenu(null), 700);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      ref={box}
      className="select-pop"
      style={{ left: current.x, top: current.y }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {mode === "actions" ? (
        <>
          <p className="select-quote">{current.quote}</p>
          <div className="select-actions">
            <button type="button" onClick={copyText}>
              <Copy size={14} />
              {copied ? "已复制" : "复制"}
            </button>
            <button type="button" onClick={() => setMode("ask")}>
              <MessageSquareText size={14} />
              提问
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            event.stopPropagation();
            const question = draft.trim();
            if (!question || asking) return;
            await onAsk(current.quote, question);
            setMenu(null);
          }}
        >
          <p className="select-quote">{current.quote}</p>
          <textarea
            rows={3}
            autoFocus
            value={draft}
            placeholder="针对这段自由提问…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="select-actions">
            <button type="button" onClick={() => setMode("actions")}>
              返回
            </button>
            <button type="submit" disabled={asking || !draft.trim()}>
              {asking ? "处理中…" : "发送"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
