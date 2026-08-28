import { NextResponse } from "next/server";
import { LlmError } from "@/lib/llm";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(error: unknown, fallback = "请求失败") {
  const message = error instanceof Error ? error.message : fallback;
  const status = error instanceof LlmError && error.status && error.status < 500 ? error.status : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function readBody<T>(request: Request) {
  return (await request.json()) as T;
}
