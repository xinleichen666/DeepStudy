// 每天 08:00 抓取 arXiv quant-ph 当日新列表，把光子集成芯片相关论文按日期存成 PDF。
// 计划任务：DeepStudy Arxiv PIC → scripts\arxiv-pic-daily.cmd
import { mkdir, readFile, writeFile, appendFile, stat } from "node:fs/promises";
import path from "node:path";

const LIST_URL = "https://arxiv.org/list/quant-ph/new?skip=0&show=2000";
const ROOT = process.env.ARXIV_PIC_DIR || path.join(path.resolve(import.meta.dirname, ".."), "arxiv-pic");
const USER_AGENT = "DeepStudy-arxiv-pic/1.0 (local daily archive)";

const PHRASES = [
  "photonic integrated",
  "integrated photonic",
  "photonic circuit",
  "photonic chip",
  "silicon photonic",
  "silicon photonics",
  "nanophotonic circuit",
  "nanophotonic chip",
  "nanophotonic waveguide",
  "on-chip optic",
  "on-chip photon",
  "lithium niobate",
  "lithium tantalate",
  "thin-film lithium",
  "thin film lithium",
  "monolithic silicon",
  "integrated quantum photonic",
  "quantum photonic circuit",
  "silicon quantum photonic",
];

const MONTHS = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

function decode(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sectionOf(heading) {
  const text = decode(heading).toLowerCase();
  if (text.startsWith("new submissions")) return "new";
  if (text.startsWith("cross-list") || text.startsWith("cross submissions")) return "cross";
  if (text.startsWith("replacement")) return "replacement";
  return "";
}

function listingDate(html) {
  const match = html.match(/Showing new listings for\s+[A-Za-z]+,\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (!match) return null;
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;
  return {
    label: `${match[1]} ${match[2]} ${match[3]}`,
    iso: `${match[3]}-${month}-${match[1].padStart(2, "0")}`,
  };
}

function parseEntries(html) {
  const chunks = html
    .split("<dl id='articles'>")
    .slice(1)
    .map((part) => part.split("</dl>")[0])
    .join("\n")
    .split(/<h3>/i)
    .slice(1);
  const entries = [];
  for (const chunk of chunks) {
    const [heading, rest = ""] = chunk.split(/<\/h3>/i);
    const section = sectionOf(heading);
    if (!section) continue;
    const blocks = rest.split(/<dt>/i).slice(1);
    for (const block of blocks) {
      const [head, body = ""] = block.split(/<dd>/i);
      const id = head.match(/arXiv:(\d{4}\.\d{4,5})/i)?.[1];
      if (!id) continue;
      const title = decode(body.match(/<div class='list-title mathjax'>([\s\S]*?)<\/div>/i)?.[1] ?? "").replace(/^Title:\s*/i, "");
      const abstract = decode(body.match(/<p class='mathjax'>([\s\S]*?)<\/p>/i)?.[1] ?? "");
      entries.push({ id, title, abstract, section });
    }
  }
  return entries;
}

function matches(entry) {
  const haystack = `${entry.title}\n${entry.abstract}`.toLowerCase();
  return PHRASES.some((phrase) => haystack.includes(phrase));
}

async function fetchResponse(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response;
}

async function isPdf(file) {
  try {
    const info = await stat(file);
    if (info.size < 1000) return false;
    const header = await readFile(file);
    return header.subarray(0, 5).toString("ascii") === "%PDF-";
  } catch {
    return false;
  }
}

async function downloadPdf(id, file) {
  const response = await fetchResponse(`https://arxiv.org/pdf/${id}`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
  if (!(await isPdf(file))) throw new Error(`pdf ${id} is not a PDF`);
}

async function log(line) {
  const text = `${new Date().toISOString()} ${line}\n`;
  process.stdout.write(text);
  await mkdir(ROOT, { recursive: true });
  await appendFile(path.join(ROOT, "run.log"), text, "utf8");
}

async function main() {
  const html = await (await fetchResponse(LIST_URL)).text();
  const date = listingDate(html);
  if (!date) throw new Error("没有解析到 arXiv 列表日期");
  const matched = parseEntries(html).filter(matches);
  const dir = path.join(ROOT, date.iso);
  await mkdir(dir, { recursive: true });

  const saved = [];
  for (const entry of matched) {
    const file = path.join(dir, `${entry.id}.pdf`);
    const existed = await isPdf(file);
    if (!existed || entry.section === "replacement") await downloadPdf(entry.id, file);
    saved.push({
      id: entry.id,
      title: entry.title,
      section: entry.section,
      pdf: file,
      skippedDownload: existed && entry.section !== "replacement",
    });
  }

  const index = {
    source: "https://arxiv.org/list/quant-ph/new",
    listingDate: date.iso,
    listingLabel: date.label,
    updatedAt: new Date().toISOString(),
    count: saved.length,
    papers: saved.map(({ skippedDownload, ...item }) => item),
  };
  await writeFile(path.join(dir, "index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await writeFile(path.join(ROOT, "latest.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
  await log(`${date.iso} 匹配 ${saved.length} 篇，目录 ${dir}`);
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  await log(`失败 ${message}`).catch(() => {});
  process.exitCode = 1;
});
