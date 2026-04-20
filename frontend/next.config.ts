import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Removed static export config to allow dev server
  images: {
    unoptimized: true,
  },
  /**
   * Chunks con hash siguen cacheables; el documento HTML pide revalidación para que tras deploy se vea la UI nueva
   * sin depender solo de hard refresh (proxies/CDN conservadores).
   */
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
  /* si tienes otras opciones de config, van aquí */
};

export default nextConfig;