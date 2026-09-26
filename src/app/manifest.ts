import type { MetadataRoute } from "next";

// For "Add to Home Screen" on Android (iOS uses apple-icon.png). It opens
// like a bookmark in the browser, as before, so sign-in and Gmail
// connecting keep working the same way.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Briefcase",
    short_name: "Briefcase",
    description: "Lean recruiting for coaches and recruiters.",
    start_url: "/",
    display: "browser",
    background_color: "#1a140e",
    theme_color: "#1a140e",
    icons: [
      { src: "/brand/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/app-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
