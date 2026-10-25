export type MailIconName =
  | "mail" | "inbox" | "send" | "file" | "archive" | "trash"
  | "folder" | "search" | "chevron-left" | "chevron-right" | "chevron-down"
  | "refresh" | "plus" | "more" | "bell" | "offline" | "close"
  | "minimize" | "expand" | "paperclip" | "star" | "sidebar";

const paths: Record<MailIconName, string> = {
  mail: "M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm-1 1 9 7 9-7",
  inbox: "m3 13 3-8h12l3 8v6H3v-6Zm0 0h5l2 3h4l2-3h5",
  send: "m21 3-7 18-4-8-8-4 19-6Zm0 0L10 13",
  file: "M6 3h8l5 5v13H6V3Zm8 0v6h5M9 13h7m-7 4h7",
  archive: "M4 8h16v13H4V8ZM3 3h18v5H3V3Zm6 9h6",
  trash: "M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7",
  folder: "M3 7V4h7l3 3h8v13H3V7Zm0 0h10",
  search: "M16.5 16.5 21 21M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  "chevron-left": "m14 5-7 7 7 7",
  "chevron-right": "m9 5 7 7-7 7",
  "chevron-down": "m5 9 7 7 7-7",
  refresh: "M20 7V2m0 0h-5m5 0-3.2 3.2A9 9 0 1 0 21 13",
  plus: "M12 4v16M4 12h16",
  more: "M12 4v.01M12 12v.01M12 20v.01",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4",
  offline: "M12 3v12m-4-4 4 4 4-4M4 15v6h16v-6",
  close: "m5 5 14 14M19 5 5 19",
  minimize: "M4 12h16",
  expand: "M14 3h7v7m0-7-7 7M10 21H3v-7m0 7 7-7",
  paperclip: "m8 12 7-7a4 4 0 0 1 6 6L10 22a6 6 0 0 1-8-8L13 3m-8 14a2 2 0 0 0 3 3l10-10",
  star: "m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1L12 2Z",
  sidebar: "M3 4h18v16H3V4Zm6 0v16M5 8h2m-2 4h2",
};

export function MailIcon({ name, size = 20, className }: {
  name: MailIconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg aria-hidden="true" className={className} fill="none" focusable="false"
      height={size} width={size} viewBox="0 0 24 24" stroke="currentColor"
      strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.65}>
      <path d={paths[name]} />
    </svg>
  );
}
