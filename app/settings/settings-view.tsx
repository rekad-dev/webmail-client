import { PasswordChangeForm } from "@/app/password-change-form";
import { SettingsProfilePicture } from "@/components/profile/settings-profile-picture";

export function SettingsView({ accountName, pictureVersion, pictureAvailable, onPictureChange }: {
  accountName: string;
  pictureVersion: number | null;
  pictureAvailable: boolean;
  onPictureChange?(version: number | null): void;
}) {
  return (
    <section className="settings-card" aria-label="Account settings">
      <div className="settings-page">
        <div className="settings-title"><p>Manage your account and security.</p></div>
        <section className="settings-section" id="profile" aria-labelledby="profile-title">
          <div className="settings-section-intro">
            <h2 id="profile-title">Profile picture</h2>
            <p>Choose the picture shown on your account in rekad Mail.</p>
          </div>
          {pictureAvailable ? (
            <SettingsProfilePicture name={accountName} initialVersion={pictureVersion} onChange={onPictureChange} />
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
    </section>
  );
}
