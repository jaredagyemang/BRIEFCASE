import { execSync } from "node:child_process";
import type { NextConfig } from "next";

// Short commit id shown on the Profile tab, so it's easy to confirm which
// version is running. Vercel provides it; locally it comes from git.
function appVersion() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  env: {
    APP_VERSION: appVersion(),
  },
  experimental: {
    // Voice notes are uploaded through a Server Action. Recordings are capped
    // at 5 minutes in the browser, which stays well under this.
    serverActions: {
      bodySizeLimit: "12mb",
    },
    proxyClientMaxBodySize: "12mb",
  },
};

export default nextConfig;
