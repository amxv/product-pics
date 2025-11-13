import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '7f5867fe2a0ce51e030f55e52b6594e0.r2.cloudflarestorage.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '25mb', // Allow 25MB uploads (20MB files + metadata)
    },
  },
};

export default nextConfig;
