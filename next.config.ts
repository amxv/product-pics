import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb', // Allow 25MB uploads (20MB files + metadata)
    },
  },
};

export default nextConfig;
