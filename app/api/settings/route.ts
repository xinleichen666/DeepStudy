import { jsonError, jsonOk, readBody } from "@/lib/http";
import { getProvider } from "@/lib/providers";
import { getSettings, publicSettings, saveSettings } from "@/lib/store";
import { testConnection } from "@/lib/llm";
import type { Settings } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const settings = await getSettings();
    return jsonOk({
      settings: publicSettings(settings),
      hasKey: Boolean(settings.apiKey),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readBody<Partial<Settings> & { test?: boolean; apiKey?: string }>(request);
    const current = await getSettings();
    const provider = body.provider ? getProvider(body.provider) : getProvider(current.provider);
    const next = await saveSettings({
      provider: body.provider ?? current.provider,
      baseUrl: body.baseUrl ?? (body.provider ? provider.baseUrl : current.baseUrl),
      model: body.model ?? (body.provider && !body.model ? provider.models[0] || current.model : current.model),
      apiKey:
        body.apiKey && !body.apiKey.includes("•")
          ? body.apiKey.trim()
          : current.apiKey,
    });

    if (body.test) {
      const reply = await testConnection(next);
      return jsonOk({ settings: publicSettings(next), hasKey: Boolean(next.apiKey), test: reply });
    }

    return jsonOk({ settings: publicSettings(next), hasKey: Boolean(next.apiKey) });
  } catch (error) {
    return jsonError(error);
  }
}
