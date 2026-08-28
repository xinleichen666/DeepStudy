const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export function pageHeaders(url: string): Record<string, string> {
  const host = safeHost(url);
  const weixin = isWeixinHost(host);
  return {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    Referer: weixin ? "https://mp.weixin.qq.com/" : `${originOf(url)}/`,
  };
}

export function imageHeaders(url: string): Record<string, string> {
  const host = safeHost(url);
  const weixin = isWeixinHost(host) || /qpic\.cn|qlogo\.cn/i.test(host);
  const arxiv = /arxiv\.org|ar5iv/i.test(host);
  return {
    "User-Agent": UA,
    Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    Referer: weixin ? "https://mp.weixin.qq.com/" : arxiv ? "https://arxiv.org/" : `${originOf(url)}/`,
  };
}

export function isWeixinHost(host: string) {
  return /weixin\.qq\.com|wechat\.com|qpic\.cn|qlogo\.cn|mp\.weixin/i.test(host);
}

export function isWeixinUrl(url: string) {
  return isWeixinHost(safeHost(url));
}

export function shouldProxyImage(url: string) {
  if (!url || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("/")) return false;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) && !isBlockedHost(parsed.hostname);
  } catch {
    return false;
  }
}

export function proxyImageSrc(url: string) {
  if (!url || url.startsWith("data:") || url.startsWith("/api/media")) return url;
  if (!shouldProxyImage(url)) return url;
  return `/api/media?u=${encodeURIComponent(url)}`;
}

export function isBlockedHost(host: string) {
  const name = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (!name || name === "localhost" || name.endsWith(".local") || name.endsWith(".internal")) return true;
  if (name === "::1" || name === "0.0.0.0") return true;
  const ipv4 = name.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function originOf(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return "https://mp.weixin.qq.com";
  }
}
