import { PasswordChangeForm } from "@/app/password-change-form";
import { SettingsProfilePicture } from "@/components/profile/settings-profile-picture";
import { Button } from "@/components/ui/button";
import type {
  NotificationPermissionState,
  NotificationTransport,
} from "@/components/mail/use-mail-notifications";

export interface SettingsNotificationProps {
  ready: boolean;
  supported: boolean;
  enabled: boolean;
  permission: NotificationPermissionState;
  transport: NotificationTransport;
  onToggle(): void;
  onSendTest(): void;
}

function notificationSummary(notifications: SettingsNotificationProps): string {
  if (!notifications.ready) return "Preparing notification settings…";
  if (!notifications.supported) {
    return "This browser does not support desktop notifications.";
  }
  if (notifications.permission === "denied") {
    return "Notifications are blocked in your browser settings. Allow notifications for this site to turn them on.";
  }
  if (notifications.enabled) {
    return "New mail alerts are on for this account.";
  }
  return "New mail alerts are off.";
}

function transportLabel(transport: NotificationTransport): string {
  if (transport === "live") return "Live updates active.";
  if (transport === "offline") return "Offline — updates resume when reconnected.";
  return "Checking for new mail every minute.";
}

export function SettingsView({
  accountName,
  pictureVersion,
  pictureAvailable,
  onPictureChange,
  notifications,
}: {
  accountName: string;
  pictureVersion: number | null;
  pictureAvailable: boolean;
  onPictureChange?(version: number | null): void;
  notifications?: SettingsNotificationProps;
}) {
  const canToggle =
    Boolean(notifications?.ready) &&
    (Boolean(notifications?.enabled) || Boolean(notifications?.supported));

  return (
    <section className="settings-card" aria-label="Account settings">
      <div className="settings-page">
        <div className="settings-title"><p>Manage your account, alerts, and security.</p></div>
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
        {notifications ? (
          <section className="settings-section" id="notifications" aria-labelledby="notifications-title">
            <div className="settings-section-intro">
              <h2 id="notifications-title">Notifications</h2>
              <p>Get alerted when new messages arrive in your Inbox.</p>
            </div>
            <div className="settings-notifications">
              <p className="settings-notifications-status" role="status">
                {notificationSummary(notifications)}
              </p>
              {notifications.ready ? (
                <p className="settings-notifications-meta">
                  {transportLabel(notifications.transport)}
                </p>
              ) : null}
              <div className="settings-notifications-actions">
                <Button
                  type="button"
                  variant={notifications.enabled ? "outline" : "default"}
                  aria-pressed={notifications.enabled}
                  disabled={!canToggle}
                  onClick={notifications.onToggle}
                >
                  {notifications.enabled ? "Turn off alerts" : "Enable alerts"}
                </Button>
                {notifications.enabled && notifications.permission === "granted" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={notifications.onSendTest}
                  >
                    Send test notification
                  </Button>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}
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
