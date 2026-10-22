import type { NextRequest } from "next/server";

import { handlers } from "@/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  const response = await handlers.GET(request);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export const POST = handlers.POST;
