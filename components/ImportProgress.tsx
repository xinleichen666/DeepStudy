"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useFormStatus } from "react-dom";

type Kind = "url" | "pdf";

const URL_STAGES = [
  { at: 0, label: "已收到链接", hint: "正在准备抓取任务" },
  { at: 1.2, label: "打开原文页面", hint: "浏览器加载网页或 PDF" },
  { at: 6, label: "抽取正文与配图", hint: "保留原始结构，不丢掉图" },
  { at: 14, label: "写入文库", hint: "保存标题、正文和图片缓存" },
  { at: 20, label: "抽取知识点", hint: "已配置 API 时会同时生成提问" },
  { at: 42, label: "即将打开阅读页", hint: "马上跳转，请稍候" },
] as const;

const PDF_STAGES = [
  { at: 0, label: "正在上传 PDF", hint: "文件已提交到本机服务" },
  { at: 1, label: "解析文字层", hint: "抽出可检索的正文" },
  { at: 5, label: "写入文库", hint: "保存文件与页文本" },
  { at: 9, label: "抽取知识点", hint: "已配置 API 时会同时生成提问" },
  { at: 32, label: "即将打开阅读页", hint: "马上跳转，请稍候" },
] as const;

function mapElapsed(kind: Kind, seconds: number) {
  const stages = kind === "pdf" ? PDF_STAGES : URL_STAGES;
  const tau = kind === "pdf" ? 11 : 17;
  const pct = Math.min(94, Math.round(7 + 87 * (1 - Math.exp(-seconds / tau))));
  let index = 0;
  for (let i = 0; i < stages.length; i += 1) {
    if (seconds >= stages[i].at) index = i;
  }
  return { pct, index, stages };
}

export function ImportSubmit({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="primary-btn" disabled={pending} aria-busy={pending}>
      {pending ? "导入中…" : children}
    </button>
  );
}

export function ImportProgressGate({ kind }: { kind: Kind }) {
  const { pending } = useFormStatus();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!pending || !mounted) return null;
  return createPortal(<ImportProgressOverlay kind={kind} />, document.body);
}

function ImportProgressOverlay({ kind }: { kind: Kind }) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const started = performance.now();
    let frame = 0;
    const tick = () => {
      setSeconds((performance.now() - started) / 1000);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const { pct, index, stages } = useMemo(() => mapElapsed(kind, seconds), [kind, seconds]);
  const current = stages[index];

  return (
    <div className="import-progress" role="dialog" aria-modal="true" aria-labelledby="import-progress-title">
      <div className="import-progress-card">
        <p className="kicker">研迹 · 导入</p>
        <h2 id="import-progress-title">{kind === "pdf" ? "正在导入 PDF" : "正在导入文献"}</h2>
        <p className="import-progress-hint" aria-live="polite">
          {current.label}
          <span>{current.hint}</span>
        </p>
        <div
          className="import-progress-track"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-valuetext={`${current.label} ${pct}%`}
        >
          <div className="import-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="import-progress-pct">{pct}%</p>
        <ol className="import-progress-steps">
          {stages.map((stage, i) => (
            <li key={stage.label} className={i < index ? "done" : i === index ? "current" : ""}>
              <span />
              {stage.label}
            </li>
          ))}
        </ol>
        <p className="muted import-progress-note">长文或需浏览器抓取时可能要几十秒，请不要关闭页面。</p>
      </div>
    </div>
  );
}
