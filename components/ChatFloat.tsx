"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { GripHorizontal, X } from "lucide-react";
import type { ChatMessage, KnowledgePoint } from "@/lib/types";
import { MessageBody } from "@/components/MessageBody";
import { cn } from "@/lib/utils";

const OPACITY_KEY = "deepstudy.chat-opacity";
const SIZE_KEY = "deepstudy.chat-size";
const DEFAULT_SIZE = { w: 380, h: 520 };
const MIN_W = 280;
const MIN_H = 280;
const MAX_W = 720;
const MAX_H = 880;
const MARGIN = 12;

type Box = { w: number; h: number; left: number; top: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function viewport() {
  return {
    w: document.documentElement.clientWidth,
    h: document.documentElement.clientHeight,
  };
}

function fitBox(next: Box): Box {
  const view = viewport();
  const w = clamp(next.w, MIN_W, Math.min(MAX_W, view.w - MARGIN * 2));
  const h = clamp(next.h, MIN_H, Math.min(MAX_H, view.h - MARGIN * 2));
  return {
    w,
    h,
    left: clamp(next.left, MARGIN, Math.max(MARGIN, view.w - w - MARGIN)),
    top: clamp(next.top, MARGIN, Math.max(MARGIN, view.h - h - MARGIN)),
  };
}

function readSize() {
  try {
    const raw = window.localStorage.getItem(SIZE_KEY);
    if (!raw) return DEFAULT_SIZE;
    const parsed = JSON.parse(raw) as { w?: number; h?: number };
    return {
      w: Number(parsed.w) || DEFAULT_SIZE.w,
      h: Number(parsed.h) || DEFAULT_SIZE.h,
    };
  } catch {
    return DEFAULT_SIZE;
  }
}

function cornerBox(size = readSize()): Box {
  const view = viewport();
  const fitted = fitBox({ ...size, left: 0, top: 0 });
  return fitBox({
    ...fitted,
    left: view.w - fitted.w - MARGIN,
    top: view.h - fitted.h - MARGIN,
  });
}

export function ChatFloat({
  points,
  activeId,
  openedIds,
  messages,
  streaming,
  streamingFor,
  sending,
  error,
  onClose,
  onSend,
  onSelectPoint,
  relatedNames,
}: {
  points: KnowledgePoint[];
  activeId: string;
  openedIds: string[];
  messages: ChatMessage[];
  streaming: string;
  streamingFor?: string | null;
  sending: boolean;
  error: string;
  onClose: () => void;
  onSend: (text: string) => void;
  onSelectPoint: (id: string) => void;
  relatedNames: Record<string, string>;
}) {
  const [draft, setDraft] = useState("");
  const [showDef, setShowDef] = useState(false);
  const [opacity, setOpacity] = useState(0.62);
  const [box, setBox] = useState<Box>({ ...DEFAULT_SIZE, left: MARGIN, top: MARGIN });
  const [scale, setScale] = useState(100);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const boxRef = useRef(box);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const resize = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const scaleOrigin = useRef<{ x: number; y: number; fromLeft: number; fromTop: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const active = points.find((item) => item.id === activeId) ?? points[0];
  const opened = new Set(openedIds);
  const sections = points.filter(
    (point) =>
      point.id === activeId ||
      point.discussed ||
      opened.has(point.id) ||
      messages.some((item) => item.knowledgePointId === point.id),
  );
  const streamTarget = streamingFor || activeId;
  boxRef.current = box;

  useEffect(() => {
    const start = cornerBox();
    setHost(document.body);
    const raw = window.localStorage.getItem(OPACITY_KEY);
    if (raw != null) {
      const stored = Number(raw);
      if (Number.isFinite(stored)) setOpacity(clamp(stored >= 0.85 ? 0.62 : stored, 0.35, 1));
    }
    setBox(start);
    setScale(clamp(Math.round((start.w / DEFAULT_SIZE.w) * 100), 70, 160));
    setReady(true);
  }, []);

  useEffect(() => {
    function onWinResize() {
      setBox((current) => fitBox(current));
    }
    window.addEventListener("resize", onWinResize);
    return () => window.removeEventListener("resize", onWinResize);
  }, []);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      if (resize.current) {
        const next = fitBox({
          ...boxRef.current,
          w: resize.current.w + event.clientX - resize.current.x,
          h: resize.current.h + event.clientY - resize.current.y,
        });
        boxRef.current = next;
        setBox(next);
        window.localStorage.setItem(SIZE_KEY, JSON.stringify({ w: next.w, h: next.h }));
        setScale(clamp(Math.round((next.w / DEFAULT_SIZE.w) * 100), 70, 160));
        return;
      }
      if (!drag.current) return;
      const next = fitBox({
        ...boxRef.current,
        left: drag.current.left + event.clientX - drag.current.x,
        top: drag.current.top + event.clientY - drag.current.y,
      });
      boxRef.current = next;
      setBox(next);
    }
    function onUp() {
      drag.current = null;
      resize.current = null;
      scaleOrigin.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, []);

  useEffect(() => {
    setShowDef(false);
  }, [activeId]);

  useEffect(() => {
    const log = scroller.current;
    if (!log) return;
    const current = log.querySelector(`[data-kp-section="${activeId}"]`);
    const focus =
      current?.querySelector(".bubble.pending") ||
      current?.querySelector(".bubble:last-of-type") ||
      current;
    focus?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [activeId, messages.length, streaming, sending]);

  function persistSize(size: { w: number; h: number }, origin?: { x: number; y: number; fromLeft: number; fromTop: number }) {
    const current = boxRef.current;
    const view = viewport();
    const w = clamp(size.w, MIN_W, Math.min(MAX_W, view.w - MARGIN * 2));
    const h = clamp(size.h, MIN_H, Math.min(MAX_H, view.h - MARGIN * 2));
    const fromLeft = origin?.fromLeft ?? 0.5;
    const fromTop = origin?.fromTop ?? 0.5;
    const anchorX = origin?.x ?? current.left + current.w * fromLeft;
    const anchorY = origin?.y ?? current.top + current.h * fromTop;
    const next = fitBox({
      w,
      h,
      left: anchorX - fromLeft * w,
      top: anchorY - fromTop * h,
    });
    boxRef.current = next;
    setBox(next);
    window.localStorage.setItem(SIZE_KEY, JSON.stringify({ w: next.w, h: next.h }));
  }

  function captureScaleOrigin(event: React.PointerEvent<HTMLInputElement>) {
    const current = boxRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    scaleOrigin.current = {
      x,
      y,
      fromLeft: current.w ? (x - current.left) / current.w : 0.85,
      fromTop: current.h ? (y - current.top) / current.h : 0.08,
    };
  }

  function onScaleInput(event: React.ChangeEvent<HTMLInputElement>) {
    const percent = Number(event.target.value);
    setScale(percent);
    const current = boxRef.current;
    if (!scaleOrigin.current) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      scaleOrigin.current = {
        x,
        y,
        fromLeft: current.w ? (x - current.left) / current.w : 0.85,
        fromTop: current.h ? (y - current.top) / current.h : 0.08,
      };
    }
    const ratio = percent / 100;
    persistSize(
      {
        w: Math.round(DEFAULT_SIZE.w * ratio),
        h: Math.round(DEFAULT_SIZE.h * ratio),
      },
      scaleOrigin.current,
    );
  }

  function persistOpacity(next: number) {
    setOpacity(next);
    window.localStorage.setItem(OPACITY_KEY, String(next));
  }

  function startDrag(event: React.PointerEvent) {
    const target = event.target as HTMLElement;
    if (target.closest("input, button, label, a, textarea")) return;
    event.preventDefault();
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      left: boxRef.current.left,
      top: boxRef.current.top,
    };
  }

  function startResize(event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    resize.current = {
      x: event.clientX,
      y: event.clientY,
      w: boxRef.current.w,
      h: boxRef.current.h,
    };
  }

  function submit(text: string) {
    const next = text.trim();
    if (!next || sending) return;
    setDraft("");
    onSend(next);
  }

  if (!active) return null;

  const node = (
    <section
      className="chat-float"
      style={{
        width: box.w,
        height: box.h,
        left: box.left,
        top: box.top,
        right: "auto",
        bottom: "auto",
        visibility: ready ? "visible" : "hidden",
        ["--chat-alpha" as string]: String(opacity),
      }}
    >
      <header className="chat-chrome" onPointerDown={startDrag}>
        <p className="chat-drag" aria-hidden>
          <GripHorizontal size={16} />
        </p>
        <div className="chat-heading">
          <p className="chat-kicker">
            本文问答
            <i />
            {active.category}
            <i />
            {active.difficulty === "basic" ? "基础" : active.difficulty === "intermediate" ? "进阶" : "深入"}
          </p>
          <h3>当前：{active.name}</h3>
        </div>
        <div className="chat-tools">
          <label className="chat-dial" title="越左越透明">
            <span>透</span>
            <input
              type="range"
              min={35}
              max={100}
              value={Math.round(opacity * 100)}
              aria-label="对话框透明度"
              onChange={(event) => persistOpacity(Number(event.target.value) / 100)}
            />
          </label>
          <label className="chat-dial" title="整体放大或缩小">
            <span>大</span>
            <input
              type="range"
              min={70}
              max={160}
              value={scale}
              aria-label="对话框大小"
              onPointerDown={captureScaleOrigin}
              onChange={onScaleInput}
            />
          </label>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            <X size={16} />
          </button>
        </div>
      </header>

      {sections.length > 1 ? (
        <div className="chat-tabs">
          {sections.map((point) => (
            <button
              key={point.id}
              type="button"
              className={cn(point.id === activeId && "active")}
              onClick={() => onSelectPoint(point.id)}
            >
              <MessageBody text={point.name} compact />
            </button>
          ))}
        </div>
      ) : null}

      <div className="chat-pane">
        {active.definition ? (
          <button type="button" className={cn("chat-def", showDef && "open")} onClick={() => setShowDef((value) => !value)}>
            <MessageBody text={active.definition} compact />
          </button>
        ) : null}

        <div className="chat-log" ref={scroller}>
          {sections.map((point) => {
            const thread = messages
              .filter((item) => item.knowledgePointId === point.id)
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            return (
              <section
                key={point.id}
                className={cn("chat-section", point.id === activeId && "current")}
                data-kp-section={point.id}
              >
                <h4>
                  <MessageBody text={point.name} compact />
                </h4>
                <div className="bubble seed">
                  <span>研迹先问你</span>
                  <MessageBody text={point.question} />
                </div>
                {thread.map((message) => (
                  <div key={message.id} className={cn("bubble", message.role)}>
                    <span>{message.role === "user" ? "我" : "研迹"}</span>
                    <MessageBody text={displayUserText(message.content, message.role)} names={relatedNames} />
                  </div>
                ))}
                {point.id === streamTarget && sending && !streaming ? (
                  <div className="bubble assistant pending">
                    <span>研迹</span>
                    <p className="chat-pending">正在写，请稍候…</p>
                  </div>
                ) : null}
                {point.id === streamTarget && streaming ? (
                  <div className="bubble assistant">
                    <span>研迹</span>
                    <MessageBody text={streaming} names={relatedNames} />
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        {error ? <p className="form-error chat-error">{error}</p> : null}

        <div className="chat-suggest">
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              submit(
                "像组会导师那样讲：一句话点破，必要公式用 LaTeX 写在 ## 公式 里并解释符号，再给不超过 4 条要点（含假设与适用范围）。不要客套，不要灌水文。",
              )
            }
          >
            精讲
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() =>
              submit("给一个板书级例子：必要时写出公式，再用代码块画极简示意，最后一句对应到本文。")
            }
          >
            例子
          </button>
          <button
            type="button"
            disabled={sending}
            onClick={() => submit("指出最容易混淆的概念，一条对比即可；若两者公式不同，把公式写出来。")}
          >
            易混
          </button>
        </div>

        <form
          className="chat-input"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            submit(draft);
          }}
        >
          <textarea
            rows={2}
            value={draft}
            placeholder={`针对「${active.name}」追问，或用自己的话回答…`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit(draft);
              }
            }}
          />
          <button type="submit" disabled={sending || !draft.trim()} aria-busy={sending}>
            {sending ? "…" : "发送"}
          </button>
        </form>
      </div>

      <button type="button" className="chat-resize" aria-label="拖动调整对话框大小" onPointerDown={startResize} />
    </section>
  );

  return host ? createPortal(node, host) : node;
}

function displayUserText(text: string, role: ChatMessage["role"]) {
  if (role !== "user") return text;
  if (text.startsWith("像组会导师那样讲")) return "请精讲这个知识点";
  if (text.startsWith("给一个板书级例子")) return "请给一个对应本文的例子";
  if (text.startsWith("指出最容易混淆的概念")) return "请指出最容易混淆的地方";
  return text;
}
