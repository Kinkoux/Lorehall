import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Map uploads go through a server action; default limit is 1 MB.
    // 12mb = 10 MB image cap + multipart overhead headroom.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
