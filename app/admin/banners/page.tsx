import { notFound, redirect } from "next/navigation";
import { getAuthSession } from "@/auth";
import { isManagedBannerAdmin } from "@/lib/mail/managed-banner-store.mts";
import { BannerSettings } from "./banner-settings";

export const dynamic = "force-dynamic";

export default async function AdminBannersPage() {
  const session = await getAuthSession();
  if (!session?.user?.id || !session.expires || Date.parse(session.expires) <= Date.now()) {
    redirect("/");
  }
  if (!isManagedBannerAdmin(session.user.id)) notFound();
  return <BannerSettings />;
}
