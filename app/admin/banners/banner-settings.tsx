"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { RichTextEditor } from "../../rich-text-editor";

interface BannerSettings {
  headerHtml: string;
  footerHtml: string;
  version: number;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseSettings(value: unknown): BannerSettings | null {
  const settings = objectValue(value);
  if (
    !settings ||
    typeof settings.headerHtml !== "string" ||
    typeof settings.footerHtml !== "string" ||
    typeof settings.version !== "number" ||
    !Number.isSafeInteger(settings.version)
  ) return null;
  return {
    headerHtml: settings.headerHtml,
    footerHtml: settings.footerHtml,
    version: settings.version,
  };
}

export function BannerSettings() {
  const [settings, setSettings] = useState<BannerSettings | null>(null);
  const [savedSettings, setSavedSettings] = useState<BannerSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/admin/banners", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          signal: controller.signal,
          headers: { accept: "application/json" },
        });
        const value: unknown = await response.json();
        const loaded = response.ok ? parseSettings(value) : null;
        if (!loaded) throw new Error("settings_unavailable");
        setSettings(loaded);
        setSavedSettings(loaded);
      } catch {
        if (!controller.signal.aborted) {
          setError(true);
          setFeedback("Banner settings could not be loaded. Check your access and try again.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, []);

  async function save() {
    if (!settings || saving) return;
    setSaving(true);
    setFeedback(null);
    setError(false);
    try {
      const response = await fetch("/api/admin/banners", {
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          headerHtml: settings.headerHtml,
          footerHtml: settings.footerHtml,
        }),
      });
      const value: unknown = await response.json();
      const saved = response.ok ? parseSettings(value) : null;
      if (!saved) throw new Error("settings_save_failed");
      setSettings(saved);
      setSavedSettings(saved);
      setFeedback("Banners saved. They’ll appear in every outgoing message.");
    } catch {
      setError(true);
      setFeedback("Banner settings could not be saved. Your edits are still here.");
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = Boolean(
    settings && savedSettings &&
      (settings.headerHtml !== savedSettings.headerHtml || settings.footerHtml !== savedSettings.footerHtml),
  );

  return (
    <main className="admin-banner-shell">
      <header className="admin-banner-header">
        <div className="admin-banner-brand-group">
          <a className="mail-brand sign-in-brand-link" href="/">
            <Image className="brand-image" src="/logo.png" alt="rekad logo" width={38} height={39} priority />
            <span className="brand-wordmark">rekad</span>
            <span className="brand-name">Mail</span>
          </a>
          <div className="admin-banner-heading">
            <p className="eyebrow">core@rekad.id</p>
            <h1>Outgoing banners</h1>
          </div>
        </div>
        <a className="admin-banner-back" href="/">
          <span aria-hidden="true">←</span>
          Back to inbox
        </a>
      </header>
      <section aria-busy={loading || saving} className="admin-banner-card">
        <p>
          These core group header and footer banners are added to every outgoing
          rekad message. Everyone can see them in compose; only listed app
          administrators can change them.
        </p>
        {loading ? <p role="status">Loading banner settings…</p> : null}
        {settings ? (
          <>
            <div className="admin-banner-editor">
              <label htmlFor="banner-header">Header banner</label>
              <RichTextEditor
                disabled={saving}
                id="banner-header"
                label="Header banner"
                onChange={(headerHtml) => setSettings((current) => current
                  ? { ...current, headerHtml }
                  : current)}
                value={settings.headerHtml || "<p></p>"}
              />
              <div className="admin-banner-preview" aria-label="Header banner preview">
                {settings.headerHtml
                  ? <div dangerouslySetInnerHTML={{ __html: settings.headerHtml }} />
                  : <span className="muted">No header banner</span>}
              </div>
            </div>
            <div className="admin-banner-editor">
              <label htmlFor="banner-footer">Footer banner</label>
              <RichTextEditor
                disabled={saving}
                id="banner-footer"
                label="Footer banner"
                onChange={(footerHtml) => setSettings((current) => current
                  ? { ...current, footerHtml }
                  : current)}
                value={settings.footerHtml || "<p></p>"}
              />
              <div className="admin-banner-preview" aria-label="Footer banner preview">
                {settings.footerHtml
                  ? <div dangerouslySetInnerHTML={{ __html: settings.footerHtml }} />
                  : <span className="muted">No footer banner</span>}
              </div>
            </div>
            <button className="admin-banner-save" disabled={saving || !hasChanges} onClick={() => void save()} type="button">
              {saving ? "Saving…" : "Save banners"}
            </button>
          </>
        ) : null}
        {feedback ? <p className="admin-banner-feedback" role={error ? "alert" : "status"}>{feedback}</p> : null}
      </section>
    </main>
  );
}
