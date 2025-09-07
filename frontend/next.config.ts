import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Agrega esta línea para generar una salida estática
  output: 'export',
  images: {
    unoptimized: true,
  },
  /* si tienes otras opciones de config, van aquí */
};

export default nextConfig;