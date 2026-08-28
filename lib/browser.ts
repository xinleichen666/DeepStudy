import { existsSync } from "fs";
import { chromium, type Browser, type Page, type Response } from "playwright-core";
import type { CapturedImage } from "./media-cache";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const CHROME_PATHS = [
  process.env.DEEPSTUDY_BROWSER,
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/microsoft-edge",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter((item): item is string => Boolean(item));

let browserPromise: Promise<Browser> | null = null;

export type RenderedDocument =
  | { kind: "pdf"; buffer: Buffer; finalUrl: string; fileName: string }
  | { kind: "html"; html: string; title: string; finalUrl: string; images: CapturedImage[] };

async function launchBrowser() {
  const errors: string[] = [];
  for (const channel of ["msedge", "chrome"] as const) {
    try {
      return await chromium.launch({
        channel,
        headless: true,
        args: ["--disable-dev-shm-usage", "--no-sandbox"],
      });
    } catch (error) {
      errors.push(`${channel}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const executablePath = CHROME_PATHS.find((item) => existsSync(item));
  if (executablePath) {
    return chromium.launch({
      executablePath,
      headless: true,
      args: ["--disable-dev-shm-usage", "--no-sandbox"],
    });
  }
  throw new Error(
    `未找到本机 Chrome / Edge。请安装其中之一，或设置环境变量 DEEPSTUDY_BROWSER 指向浏览器可执行文件。${errors[0] ? `（${errors[0]}）` : ""}`,
  );
}

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = launchBrowser().catch((error) => {
      browserPromise = null;
      throw error;
    });
  }
  return browserPromise;
}

export async function renderDocument(url: string): Promise<RenderedDocument> {
  const browser = await getBrowser();
  const page = await browser.newPage({
    userAgent: UA,
    viewport: { width: 1280, height: 2400 },
    locale: "zh-CN",
  });
  const images = new Map<string, CapturedImage>();

  page.on("response", (response) => {
    void captureImage(response, images);
  });

  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    const target = route.request().url();
    if (type === "font" || type === "websocket") {
      return route.abort();
    }
    if (/google-analytics|googletagmanager|doubleclick|umeng|cnzz|hotjar|scorecardresearch/i.test(target)) {
      return route.abort();
    }
    return route.continue();
  });

  try {
    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    const contentType = (response?.headers()["content-type"] || "").toLowerCase();
    if (response && (contentType.includes("pdf") || url.toLowerCase().includes(".pdf"))) {
      const buffer = Buffer.from(await response.body());
      if (buffer.slice(0, 5).toString() === "%PDF-") {
        return {
          kind: "pdf",
          buffer,
          finalUrl: page.url(),
          fileName: fileNameFromUrl(page.url()),
        };
      }
    }
    await loadFullPage(page);
    const html = await page.content();
    const title = await page.title();
    return { kind: "html", html, title, finalUrl: page.url(), images: [...images.values()] };
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function captureImage(response: Response, images: Map<string, CapturedImage>) {
  const type = response.request().resourceType();
  const mime = (response.headers()["content-type"] || "").toLowerCase();
  const isImage = type === "image" || mime.startsWith("image/");
  if (!isImage || !response.ok()) return;
  try {
    const buffer = Buffer.from(await response.body());
    if (buffer.byteLength < 80) return;
    images.set(response.url().split("#")[0], { url: response.url(), buffer, mime });
  } catch {
    // body already consumed or navigation aborted
  }
}

async function loadFullPage(page: Page) {
  await Promise.race([
    page.waitForLoadState("networkidle"),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);
  await page.evaluate(prepareDomInPage);
  await page.evaluate(async () => {
    const root = document.scrollingElement || document.body;
    const height = Math.max(root.scrollHeight, document.body.scrollHeight, 2400);
    for (let y = 0; y < height; y += 800) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 140));
    }
    window.scrollTo(0, 0);
  });
  await page.evaluate(prepareDomInPage);
  await page.evaluate(async () => {
    const imgs = Array.from(document.images);
    await Promise.race([
      Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.addEventListener("load", () => resolve(), { once: true });
                img.addEventListener("error", () => resolve(), { once: true });
              }),
        ),
      ),
      new Promise<void>((resolve) => setTimeout(resolve, 8000)),
    ]);
  });
}

function prepareDomInPage() {
  const lazyAttrs = [
    "data-src",
    "data-original",
    "data-original-src",
    "data-lazy-src",
    "data-lazyload",
    "data-actualsrc",
    "data-url",
    "data-imgurl",
    "data-imgsrc",
    "data-echo",
  ];
  document.querySelectorAll("#js_content, article, main, [role='main']").forEach((el) => {
    const node = el as HTMLElement;
    node.hidden = false;
    node.style.opacity = "1";
    node.style.visibility = "visible";
    if (node.style.display === "none") node.style.display = "block";
  });
  document.querySelectorAll("img").forEach((img) => {
    img.removeAttribute("loading");
    for (const name of lazyAttrs) {
      const real = img.getAttribute(name)?.trim();
      if (real && !real.startsWith("data:image")) {
        img.src = real;
        break;
      }
    }
    const srcset = img.getAttribute("data-srcset") || img.getAttribute("srcset") || "";
    if ((!img.getAttribute("src") || img.src.startsWith("data:image")) && srcset) {
      const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
      if (first) img.src = first;
    }
  });
  document.querySelectorAll("source").forEach((source) => {
    const real = source.getAttribute("data-srcset") || source.getAttribute("data-src");
    if (real) {
      if (real.includes(",")) source.setAttribute("srcset", real);
      else source.setAttribute("src", real);
    }
  });
}

function fileNameFromUrl(url: string) {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "");
    return name.toLowerCase().endsWith(".pdf") ? name : "article.pdf";
  } catch {
    return "article.pdf";
  }
}
