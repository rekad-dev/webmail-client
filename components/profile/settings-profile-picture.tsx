"use client";

import { useState } from "react";
import { ProfilePictureEditor } from "./profile-picture-editor";

export function SettingsProfilePicture({ name, initialVersion }: { name: string; initialVersion: number | null }) {
  const [version, setVersion] = useState(initialVersion);
  return <ProfilePictureEditor name={name} version={version} onChange={setVersion} />;
}
