import Image from "next/image";
import { PasswordChangeForm } from "@/app/password-change-form";
import { SettingsProfilePicture } from "@/components/profile/settings-profile-picture";
import { MailIcon } from "@/app/mail-icons";

export function SettingsView({ accountName, pictureVersion, pictureAvailable }: {
  accountName: string;
  pictureVersion: number | null;
  pictureAvailable: boolean;
}) {
  return (
    <main className="settings-shell">
      <header className="settings-header">
        <a className="settings-brand" href="/" aria-label="rekad Mail home">
          <Image src="/logo.png" width={38} height={39} alt="" />
          <span>rekad</span><strong>Mail</strong>
        </a>
        <a className="settings-back" href="/"><MailIcon name="chevron-left" size={16} />Back to mail</a>
      </header>
      <div className="settings-page">
        <div className="settings-title"><h1>Settings</h1><p>Manage your account and security.</p></div>
        <nav className="settings-navigation" aria-label="Settings sections">
          <a href="#profile">Profile</a><a href="#security">Security</a>
        </nav>
        <section className="settings-section" id="profile" aria-labelledby="profile-title">
          <div className="settings-section-intro">
            <h2 id="profile-title">Profile picture</h2>
            <p>Choose the picture shown on your account in rekad Mail.</p>
          </div>
          {pictureAvailable ? (
            <SettingsProfilePicture name={accountName} initialVersion={pictureVersion} />
          ) : (
            <p className="settings-unavailable" role="status">Your profile picture is temporarily unavailable. Refresh to try again.</p>
          )}
        </section>
        <section className="settings-section" id="security" aria-labelledby="security-title">
          <div className="settings-section-intro">
            <h2 id="security-title">Change password</h2>
            <p>Update the password for your mail account.</p>
          </div>
          <PasswordChangeForm />
        </section>
      </div>
    </main>
  );
}
