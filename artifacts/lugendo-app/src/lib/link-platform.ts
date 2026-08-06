import { HardDrive, Instagram, Link2, Youtube, type LucideIcon } from "lucide-react";

// Platform is derived from the URL's hostname at read time -- never persisted (a link created
// before a platform gains an icon, or whose URL changes host, should always render correctly).
export interface LinkPlatform {
  label: string;
  icon: LucideIcon;
}

const GENERIC: LinkPlatform = { label: "Enlace", icon: Link2 };

export function getLinkPlatform(url: string): LinkPlatform {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return GENERIC;
  }

  if (hostname === "youtube.com" || hostname === "youtu.be" || hostname.endsWith(".youtube.com")) {
    return { label: "YouTube", icon: Youtube };
  }
  if (hostname === "drive.google.com") {
    return { label: "Google Drive", icon: HardDrive };
  }
  if (hostname === "instagram.com" || hostname.endsWith(".instagram.com")) {
    return { label: "Instagram", icon: Instagram };
  }
  return GENERIC;
}
