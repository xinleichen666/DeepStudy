"use server";

import { redirect } from "next/navigation";
import { getProvider } from "@/lib/providers";
import { getSettings, saveSettings, deleteArticle } from "@/lib/store";
import { testConnection } from "@/lib/llm";
import type { ProviderId } from "@/lib/types";

function bounce(back: string, query?: Record<string, string>) {
  const path = back.startsWith("/") ? back.split("?")[0] : "/";
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
  }
  const suffix = params.toString();
  redirect(suffix ? `${path}?${suffix}` : path);
}

function backOf(formData: FormData) {
  const back = String(formData.get("back") || "/");
  return back.startsWith("/") ? back : "/";
}

export async function deleteArticleAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (id) await deleteArticle(id);
  redirect("/");
}

export async function ingestUrlAction(formData: FormData) {
  const back = backOf(formData);
  const url = String(formData.get("url") || "").trim();
  if (!url) bounce(back, { importError: "请先粘贴文章链接" });
  const { extractIfPossible, saveImportedUrl } = await import("@/lib/article-ingest");
  let articleId = "";
  try {
    articleId = (await saveImportedUrl(url)).id;
  } catch (error) {
    bounce(back, { importError: error instanceof Error ? error.message : "导入失败" });
  }
  await extractIfPossible(articleId).catch(() => undefined);
  redirect(`/read/${articleId}`);
}

export async function ingestPdfAction(formData: FormData) {
  const back = backOf(formData);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size < 8) {
    bounce(back, { importError: "请选择 PDF 文件" });
  }
  const { extractIfPossible, saveImportedPdf } = await import("@/lib/article-ingest");
  let articleId = "";
  try {
    articleId = (await saveImportedPdf(file as File)).id;
  } catch (error) {
    bounce(back, { importError: error instanceof Error ? error.message : "导入失败" });
  }
  await extractIfPossible(articleId).catch(() => undefined);
  redirect(`/read/${articleId}`);
}

async function persistSettings(formData: FormData) {
  const current = await getSettings();
  const provider = String(formData.get("provider") || current.provider) as ProviderId;
  const info = getProvider(provider);
  const previous = getProvider(current.provider);
  const apiKey = String(formData.get("apiKey") || "").trim();
  const rawBase = String(formData.get("baseUrl") || "").trim();
  const baseUrl =
    !rawBase || (provider !== current.provider && rawBase === previous.baseUrl) ? info.baseUrl : rawBase;
  const rawModel = String(formData.get("model") || "").trim();
  const model =
    !rawModel || (provider !== current.provider && rawModel === current.model)
      ? info.models[0] || rawModel
      : rawModel;
  return saveSettings({
    provider,
    baseUrl,
    model,
    apiKey: apiKey && !apiKey.includes("•") ? apiKey : current.apiKey,
  });
}

export async function saveSettingsAction(formData: FormData) {
  const back = backOf(formData);
  try {
    await persistSettings(formData);
  } catch (error) {
    bounce(back, { settingsError: error instanceof Error ? error.message : "保存失败" });
  }
  bounce(back, { saved: "1" });
}

export async function testSettingsAction(formData: FormData) {
  const back = backOf(formData);
  try {
    const next = await persistSettings(formData);
    const reply = await testConnection(next);
    bounce(back, { saved: `连通成功：${reply}` });
  } catch (error) {
    bounce(back, { settingsError: error instanceof Error ? error.message : "测试失败" });
  }
}
