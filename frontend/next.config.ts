import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Removed static export config to allow dev server
  images: {
    unoptimized: true,
  },
  /* si tienes otras opciones de config, van aquí */
};

export default nextConfig;