import { linkedAccountsHandlers } from "@/lib/auth/linked-accounts-server.mts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = linkedAccountsHandlers.POST_add;
