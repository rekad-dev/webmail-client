"use client";

import { useState } from "react";
import { ProfilePictureEditor } from "./profile-picture-editor";

export function SettingsProfilePicture({ name, initialVersion, onChange }: { name: string; initialVersion: number | null; onChange?(version: number | null): void }) {
  const [version, setVersion] = useState(initialVersion);
  return <ProfilePictureEditor name={name} version={version} onChange={(next) => { setVersion(next); onChange?.(next); }} />;
}
