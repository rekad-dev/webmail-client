import { redirect } from "next/navigation";
import { getAuthSession } from "@/auth";
import { PasswordChangeForm } from "@/app/password-change-form";

export default async function SettingsPage() {
  const session = await getAuthSession();
  if (!session?.expires || !(Date.parse(session.expires) > Date.now())) redirect("/");

  return (
    <main className="settings-page">
      <nav aria-label="Settings navigation"><a href="/">← Back to mail</a></nav>
      <h1>Settings</h1>
      <section className="settings-card" aria-label="Password settings">
        <PasswordChangeForm />
      </section>
    </main>
  );
}
