import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
