export function openArticleWindow(id: string) {
  if (typeof window === "undefined") return null;
  const area = screenArea();
  const alreadySplit = window.outerWidth < area.width * 0.82;
  if (alreadySplit) {
    return openAt(id, { left: area.left, top: area.top, width: area.width, height: area.height });
  }
  const half = Math.max(520, Math.floor(area.width / 2));
  placeCurrentWindow({ left: area.left, top: area.top, width: half, height: area.height });
  return openAt(id, {
    left: area.left + half,
    top: area.top,
    width: area.width - half,
    height: area.height,
  });
}

export function openLoadingWindow() {
  if (typeof window === "undefined") return null;
  const area = screenArea();
  const alreadySplit = window.outerWidth < area.width * 0.82;
  const half = Math.max(520, Math.floor(area.width / 2));
  const box = alreadySplit
    ? { left: area.left, top: area.top, width: area.width, height: area.height }
    : { left: area.left + half, top: area.top, width: area.width - half, height: area.height };
  if (!alreadySplit) {
    placeCurrentWindow({ left: area.left, top: area.top, width: half, height: area.height });
  }
  const child = window.open("about:blank", `deepstudy-new-${Date.now()}`, featureString(box));
  if (!child) return null;
  try {
    child.moveTo(box.left, box.top);
    child.resizeTo(box.width, box.height);
    child.document.title = "研迹 · 正在导入";
    child.document.body.innerHTML =
      '<p style="font-family:Segoe UI,sans-serif;padding:28px;color:#555">正在导入文献，随后会在此窗口打开。</p>';
  } catch {
    // 部分浏览器限制改写 about:blank
  }
  return child;
}

export function showArticleInWindow(target: Window | null, id: string) {
  if (!target || target.closed) return openArticleWindow(id);
  target.location.href = `/read/${id}`;
  target.focus();
  return target;
}

function openAt(id: string, box: { left: number; top: number; width: number; height: number }) {
  const child = window.open(`/read/${id}`, `deepstudy-read-${id}`, featureString(box));
  if (!child) return null;
  try {
    child.moveTo(box.left, box.top);
    child.resizeTo(box.width, box.height);
  } catch {
    // 忽略无法移动的情况
  }
  child.focus();
  return child;
}

function placeCurrentWindow(box: { left: number; top: number; width: number; height: number }) {
  try {
    window.moveTo(box.left, box.top);
    window.resizeTo(box.width, box.height);
  } catch {
    // 非脚本打开的窗口可能无法缩放
  }
}

function screenArea() {
  const screen = window.screen as Screen & { availLeft?: number; availTop?: number };
  return {
    left: screen.availLeft || 0,
    top: screen.availTop || 0,
    width: screen.availWidth || window.innerWidth,
    height: screen.availHeight || window.innerHeight,
  };
}

function featureString(box: { left: number; top: number; width: number; height: number }) {
  return `popup=yes,width=${Math.round(box.width)},height=${Math.round(box.height)},left=${Math.round(box.left)},top=${Math.round(box.top)}`;
}
