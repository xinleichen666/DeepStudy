"use client";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page-pad">
      <header className="hero compact">
        <p className="kicker">研迹</p>
        <h1>这一页出错了。</h1>
        <p className="lede">{error.message || "请关闭后重新打开应用。"}</p>
      </header>
      <button type="button" className="primary-btn" onClick={() => reset()}>
        再试一次
      </button>
    </div>
  );
}
