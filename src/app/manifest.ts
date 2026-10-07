import type { MetadataRoute } from "next";

// For "Add to Home Screen" (iPhone, iPad and Android; iOS takes its icon from
// apple-icon.png). It opens full screen as its own app. On iPhone and iPad the
// installed app keeps its own sign-in, separate from Safari, so Connect Gmail /
// Outlook runs in a window inside the app (components/connect-mail-link.tsx).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Briefcase",
    short_name: "Briefcase",
    description: "Lean recruiting for coaches and recruiters.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#1a140e",
    theme_color: "#1a140e",
    icons: [
      { src: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
